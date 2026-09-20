import fs from "fs";
import path from "path";
import { timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb, schema } from "@/lib/db";
import {
  applyTagToMany,
  createTag,
  deleteSeriesMany,
  getLibraryStats,
  getSeriesById,
  getSettings,
  listSeries,
  listTags,
  resetSeriesProgress,
  updateItemSortPreference,
  updateSeries,
} from "@/lib/library";
import type { AiPermissionLevel, MediaType, SortBy } from "@/lib/types";

type AiActionDefinition = {
  name: string;
  level: AiPermissionLevel;
  description: string;
};

export const AI_ACTIONS: AiActionDefinition[] = [
  { name: "library.search", level: "read", description: "搜索和浏览资源库" },
  { name: "library.getSeries", level: "read", description: "读取系列及内容项详情" },
  { name: "library.stats", level: "read", description: "读取资源库统计" },
  { name: "tags.list", level: "read", description: "读取现有标签" },
  { name: "series.rate", level: "reversible", description: "修改系列评分" },
  { name: "series.sort", level: "reversible", description: "设置系列内容排序" },
  { name: "series.addTags", level: "reversible", description: "为系列添加标签" },
  {
    name: "image.analyzeAndTag",
    level: "reversible",
    description: "使用视觉模型识别图片并为所在系列添加标签",
  },
  { name: "progress.reset", level: "dangerous", description: "重置系列观看进度" },
  { name: "series.remove", level: "dangerous", description: "从资源库移除系列索引" },
];

const LEVEL_RANK: Record<AiPermissionLevel, number> = {
  read: 1,
  reversible: 2,
  dangerous: 3,
};

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".heic",
  ".heif",
  ".tiff",
  ".bmp",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(params: Record<string, unknown>, key: string): string {
  const value = String(params[key] || "").trim();
  if (!value) throw new Error(`缺少参数 ${key}`);
  return value;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
}

export function getAiAction(name: string) {
  return AI_ACTIONS.find((action) => action.name === name);
}

export function canUseAiLevel(
  configured: AiPermissionLevel,
  required: AiPermissionLevel
) {
  return LEVEL_RANK[configured] >= LEVEL_RANK[required];
}

export function verifyAiRequest(request: Request): string | null {
  const settings = getSettings();
  if (!settings.aiEnabled) return "AI 控制尚未启用";
  if (!settings.aiControlToken) return "AI 控制令牌尚未生成";
  const authorization = request.headers.get("authorization") || "";
  const headerToken = request.headers.get("x-rm-ai-token") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : headerToken.trim();
  const expected = Buffer.from(settings.aiControlToken);
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return "AI 控制令牌无效";
  }
  return null;
}

function cleanTagNames(value: unknown, maxTags = 12) {
  return [...new Set(stringArray(value).map((tag) => tag.replace(/^#+/, "").trim()))]
    .filter((tag) => tag.length >= 1 && tag.length <= 24)
    .slice(0, maxTags);
}

function addTagsToSeries(seriesId: string, namesValue: unknown) {
  const series = getSeriesById(seriesId);
  if (!series) throw new Error("系列不存在");
  const names = cleanTagNames(namesValue);
  if (!names.length) throw new Error("没有可用标签");

  const existingByName = new Map(listTags().map((tag) => [tag.name, tag]));
  const added = names.map((name) => {
    const existing = existingByName.get(name);
    if (existing) return existing;
    try {
      const created = createTag(name);
      if (!created) throw new Error(`无法创建标签：${name}`);
      existingByName.set(name, created);
      return created;
    } catch {
      const raced = listTags().find((tag) => tag.name === name);
      if (!raced) throw new Error(`无法创建标签：${name}`);
      return raced;
    }
  });

  for (const tag of added) applyTagToMany([seriesId], tag.id);
  return { seriesId, tags: added };
}

function parseVisionContent(content: unknown) {
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((part) =>
              typeof part === "string"
                ? part
                : typeof part?.text === "string"
                  ? part.text
                  : ""
            )
            .join("")
        : "";
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return asRecord(JSON.parse(cleaned));
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("视觉模型没有返回有效 JSON");
    return asRecord(JSON.parse(match[0]));
  }
}

async function analyzeImageAndTag(params: Record<string, unknown>) {
  const itemId = requiredString(params, "itemId");
  const maxTags = Math.min(12, Math.max(1, Number(params.maxTags) || 6));
  const db = getDb();
  const item = db
    .select()
    .from(schema.mediaItems)
    .where(eq(schema.mediaItems.id, itemId))
    .get();
  if (!item) throw new Error("图片不存在");
  if (!IMAGE_EXTENSIONS.has(path.extname(item.path).toLowerCase())) {
    throw new Error("当前仅支持识别独立图片文件，不支持压缩包");
  }
  if (!fs.existsSync(item.path)) throw new Error("图片文件已不存在");

  const settings = getSettings();
  if (!settings.aiVisionModel.trim()) throw new Error("请先在设置中填写视觉模型");
  let baseUrl: URL;
  try {
    baseUrl = new URL(settings.aiApiBaseUrl);
  } catch {
    throw new Error("AI 服务地址无效");
  }
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("AI 服务地址仅支持 HTTP 或 HTTPS");
  }

  const jpeg = await sharp(item.path, { animated: false })
    .rotate()
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  const endpoint = settings.aiApiBaseUrl.endsWith("/chat/completions")
    ? settings.aiApiBaseUrl
    : `${settings.aiApiBaseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.aiApiKey) headers.Authorization = `Bearer ${settings.aiApiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: settings.aiVisionModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是图片分类助手。只返回 JSON：{\"description\":\"简短中文描述\",\"tags\":[\"中文标签\"]}。标签应客观、简短、便于资源检索，不包含敏感推断。",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `识别图片并给出 1 到 ${maxTags} 个标签。` },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` },
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const payload = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    const error = asRecord(payload.error);
    throw new Error(String(error.message || `视觉模型请求失败 (${response.status})`));
  }
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message = asRecord(asRecord(choices[0]).message);
  const result = parseVisionContent(message.content);
  const tags = cleanTagNames(result.tags, maxTags);
  if (!tags.length) throw new Error("视觉模型没有返回可用标签");
  const applied = addTagsToSeries(item.seriesId, tags);
  return {
    itemId,
    seriesId: item.seriesId,
    description: String(result.description || "").trim(),
    tags: applied.tags,
  };
}

export async function executeAiAction(name: string, paramsValue: unknown) {
  const params = asRecord(paramsValue);
  if (name === "library.search") {
    const mediaType = String(params.mediaType || "") as MediaType;
    const sortBy = String(params.sortBy || "title") as SortBy;
    const validTypes = ["manga", "webtoon", "novel", "video", "photo"];
    const validSorts = ["title", "rating", "author", "updated", "added", "capture"];
    return listSeries({
      mediaType: validTypes.includes(mediaType) ? mediaType : undefined,
      search: String(params.query || "").trim() || undefined,
      sortBy: validSorts.includes(sortBy) ? sortBy : "title",
      limit: Math.min(100, Math.max(1, Number(params.limit) || 30)),
      offset: Math.max(0, Number(params.offset) || 0),
    });
  }
  if (name === "library.getSeries") {
    const series = getSeriesById(requiredString(params, "seriesId"));
    if (!series) throw new Error("系列不存在");
    return series;
  }
  if (name === "library.stats") return getLibraryStats();
  if (name === "tags.list") return { tags: listTags() };
  if (name === "series.rate") {
    const seriesId = requiredString(params, "seriesId");
    const rating = Number(params.rating);
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
      throw new Error("rating 必须是 0 到 5 的整数");
    }
    return updateSeries(seriesId, { rating });
  }
  if (name === "series.sort") {
    const seriesId = requiredString(params, "seriesId");
    if (!getSeriesById(seriesId)) throw new Error("系列不存在");
    const key = String(params.key || "name");
    const direction = String(params.direction || "asc");
    if (!["name", "created", "updated"].includes(key)) {
      throw new Error("key 必须是 name、created 或 updated");
    }
    if (!["asc", "desc"].includes(direction)) {
      throw new Error("direction 必须是 asc 或 desc");
    }
    return updateItemSortPreference(
      seriesId,
      params.locked === false
        ? null
        : {
            key: key as "name" | "created" | "updated",
            direction: direction as "asc" | "desc",
          }
    );
  }
  if (name === "series.addTags") {
    return addTagsToSeries(requiredString(params, "seriesId"), params.tags);
  }
  if (name === "image.analyzeAndTag") return analyzeImageAndTag(params);
  if (name === "progress.reset") {
    const seriesIds = stringArray(params.seriesIds);
    if (!seriesIds.length) throw new Error("缺少 seriesIds");
    return resetSeriesProgress(seriesIds);
  }
  if (name === "series.remove") {
    const seriesIds = stringArray(params.seriesIds);
    if (!seriesIds.length) throw new Error("缺少 seriesIds");
    return deleteSeriesMany(seriesIds);
  }
  throw new Error("不支持的 AI 动作");
}

export type AiConfirmation = {
  id: string;
  action: string;
  description: string;
  params: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "failed";
  createdAt: number;
  result?: unknown;
  error?: string;
};

const globalStore = globalThis as typeof globalThis & {
  __rmAiConfirmations?: Map<string, AiConfirmation>;
  __rmAiConfirmationWaiters?: Set<() => void>;
};
const confirmations =
  globalStore.__rmAiConfirmations || new Map<string, AiConfirmation>();
globalStore.__rmAiConfirmations = confirmations;
const confirmationWaiters =
  globalStore.__rmAiConfirmationWaiters || new Set<() => void>();
globalStore.__rmAiConfirmationWaiters = confirmationWaiters;

function notifyConfirmationWaiters() {
  for (const resolve of confirmationWaiters) resolve();
  confirmationWaiters.clear();
}

export function waitForAiConfirmation(timeoutMs = 4_000) {
  return new Promise<void>((resolve) => {
    const done = () => {
      windowClear();
      confirmationWaiters.delete(done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    const windowClear = () => clearTimeout(timer);
    confirmationWaiters.add(done);
  });
}

function cleanupConfirmations() {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [id, confirmation] of confirmations) {
    if (confirmation.createdAt < cutoff) confirmations.delete(id);
  }
}

export function createAiConfirmation(
  action: AiActionDefinition,
  params: Record<string, unknown>
) {
  cleanupConfirmations();
  const id = crypto.randomUUID();
  const confirmation: AiConfirmation = {
    id,
    action: action.name,
    description: action.description,
    params,
    status: "pending",
    createdAt: Date.now(),
  };
  confirmations.set(id, confirmation);
  notifyConfirmationWaiters();
  return confirmation;
}

export function listAiConfirmations(id?: string) {
  cleanupConfirmations();
  if (id) return confirmations.get(id) || null;
  return [...confirmations.values()]
    .filter((confirmation) => confirmation.status === "pending")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function resolveAiConfirmation(id: string, approved: boolean) {
  const confirmation = confirmations.get(id);
  if (!confirmation) throw new Error("确认请求不存在或已过期");
  if (confirmation.status !== "pending") return confirmation;
  if (!approved) {
    confirmation.status = "rejected";
    notifyConfirmationWaiters();
    return confirmation;
  }
  try {
    confirmation.result = await executeAiAction(
      confirmation.action,
      confirmation.params
    );
    confirmation.status = "approved";
  } catch (error) {
    confirmation.status = "failed";
    confirmation.error = error instanceof Error ? error.message : String(error);
  }
  notifyConfirmationWaiters();
  return confirmation;
}
