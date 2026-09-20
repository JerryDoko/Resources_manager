import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVER_INFO = { name: "resources-manager", version: "0.1.0" };
const DEFAULT_URLS = ["http://127.0.0.1:18765", "http://127.0.0.1:3000"];

const tools = [
  {
    name: "open_resources_manager",
    description: "打开本机 Resources Manager 桌面应用，并等待插件连接就绪。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "connection_status",
    description: "检查 Resources Manager 是否正在运行、AI 控制是否启用及当前权限等级。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_resources",
    description: "搜索资源库。读取级，可按类型、标题和排序方式筛选。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "标题搜索词，可留空" },
        mediaType: { type: "string", enum: ["manga", "webtoon", "novel", "video", "photo"] },
        sortBy: { type: "string", enum: ["title", "rating", "author", "updated", "added", "capture"] },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_series",
    description: "读取一个系列和其中项目的完整信息。读取级。",
    inputSchema: {
      type: "object",
      properties: { seriesId: { type: "string" } },
      required: ["seriesId"],
      additionalProperties: false,
    },
  },
  {
    name: "library_stats",
    description: "读取资源库统计。读取级。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_tags",
    description: "读取资源库已有标签。读取级。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "rate_series",
    description: "修改系列评分。需要可恢复级权限。",
    inputSchema: {
      type: "object",
      properties: {
        seriesId: { type: "string" },
        rating: { type: "integer", minimum: 0, maximum: 5 },
      },
      required: ["seriesId", "rating"],
      additionalProperties: false,
    },
  },
  {
    name: "sort_series",
    description: "锁定或解除一个文件夹的项目排序。需要可恢复级权限。",
    inputSchema: {
      type: "object",
      properties: {
        seriesId: { type: "string" },
        key: { type: "string", enum: ["name", "created", "updated"] },
        direction: { type: "string", enum: ["asc", "desc"] },
        locked: { type: "boolean", default: true },
      },
      required: ["seriesId", "key", "direction"],
      additionalProperties: false,
    },
  },
  {
    name: "add_series_tags",
    description: "为系列创建并添加一个或多个标签。需要可恢复级权限。",
    inputSchema: {
      type: "object",
      properties: {
        seriesId: { type: "string" },
        tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 },
      },
      required: ["seriesId", "tags"],
      additionalProperties: false,
    },
  },
  {
    name: "analyze_image_and_tag",
    description: "用设置中的视觉模型识别一张图片，并将生成的标签加入其系列。需要可恢复级权限。",
    inputSchema: {
      type: "object",
      properties: {
        itemId: { type: "string" },
        maxTags: { type: "integer", minimum: 1, maximum: 12, default: 6 },
      },
      required: ["itemId"],
      additionalProperties: false,
    },
  },
  {
    name: "reset_progress",
    description: "请求重置一个或多个系列的观看进度。危险级，必须在应用弹窗中确认。",
    inputSchema: {
      type: "object",
      properties: { seriesIds: { type: "array", items: { type: "string" }, minItems: 1 } },
      required: ["seriesIds"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_series",
    description: "请求从资源库移除一个或多个系列索引，不删除磁盘文件。危险级，必须在应用弹窗中确认。",
    inputSchema: {
      type: "object",
      properties: { seriesIds: { type: "array", items: { type: "string" }, minItems: 1 } },
      required: ["seriesIds"],
      additionalProperties: false,
    },
  },
  {
    name: "confirmation_status",
    description: "查询危险操作的确认状态和执行结果。",
    inputSchema: {
      type: "object",
      properties: { confirmationId: { type: "string" } },
      required: ["confirmationId"],
      additionalProperties: false,
    },
  },
];

const actionByTool = {
  search_resources: "library.search",
  get_series: "library.getSeries",
  library_stats: "library.stats",
  list_tags: "tags.list",
  rate_series: "series.rate",
  sort_series: "series.sort",
  add_series_tags: "series.addTags",
  analyze_image_and_tag: "image.analyzeAndTag",
  reset_progress: "progress.reset",
  remove_series: "series.remove",
};

function connectionFile() {
  if (process.env.RESOURCES_MANAGER_CONNECTION_FILE) {
    return process.env.RESOURCES_MANAGER_CONNECTION_FILE;
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "resources-manager", "ai-plugin-connection.json");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "resources-manager", "ai-plugin-connection.json");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "resources-manager", "ai-plugin-connection.json");
}

async function candidateUrls() {
  const urls = [];
  if (process.env.RESOURCES_MANAGER_URL) urls.push(process.env.RESOURCES_MANAGER_URL);
  try {
    const saved = JSON.parse(await fs.readFile(connectionFile(), "utf8"));
    if (typeof saved.url === "string") urls.push(saved.url);
  } catch {
    // The application may not have started yet.
  }
  urls.push(...DEFAULT_URLS);
  return [...new Set(urls.map((url) => url.replace(/\/$/, "")))];
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Resources Manager returned HTTP ${response.status}`);
  return payload;
}

async function findConnection() {
  for (const baseUrl of await candidateUrls()) {
    try {
      const settings = await requestJson(`${baseUrl}/api/settings`);
      return { baseUrl, settings };
    } catch {
      // Try the next local address.
    }
  }
  throw new Error("无法连接 Resources Manager。请先启动桌面应用。 ");
}

async function callAction(action, params) {
  const { baseUrl, settings } = await findConnection();
  if (!settings.aiEnabled) throw new Error("请先在 Resources Manager 设置中启用 AI 控制。");
  if (!settings.aiControlToken) throw new Error("AI 控制令牌尚未生成，请在设置中保存 AI 配置。");
  return requestJson(`${baseUrl}/api/ai`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.aiControlToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, params }),
  });
}

async function status() {
  const { baseUrl, settings } = await findConnection();
  const capabilities = await requestJson(`${baseUrl}/api/ai`);
  return {
    connected: true,
    baseUrl,
    aiEnabled: Boolean(settings.aiEnabled),
    permissionLevel: capabilities.permissionLevel,
    actions: capabilities.actions,
  };
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error) => (error ? reject(error) : resolve()));
  });
}

async function openApplication() {
  try {
    const existing = await status();
    return { opened: false, alreadyRunning: true, ...existing };
  } catch {
    // Start it below.
  }

  if (process.platform === "darwin") {
    try {
      await execFileAsync("/usr/bin/open", ["-a", "Resources Manager"]);
    } catch {
      const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
      const child = spawn("/bin/bash", [path.join(projectRoot, "scripts", "start.sh"), "start"], {
        cwd: projectRoot,
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    }
  } else if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/c", "start", "", "Resources Manager"], { detached: true, stdio: "ignore" });
    child.unref();
  } else {
    const child = spawn("resources-manager", [], { detached: true, stdio: "ignore" });
    child.unref();
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      return { opened: true, ...(await status()) };
    } catch {
      // Keep waiting for the local server.
    }
  }
  return { opened: true, connected: false, message: "应用已启动，但插件连接尚未就绪，请稍后重试。" };
}

async function callTool(name, args) {
  if (name === "open_resources_manager") return openApplication();
  if (name === "connection_status") return status();
  if (name === "confirmation_status") {
    const { baseUrl, settings } = await findConnection();
    if (!settings.aiControlToken) throw new Error("AI 控制令牌尚未生成。");
    return requestJson(`${baseUrl}/api/ai?confirmationId=${encodeURIComponent(args.confirmationId)}`, {
      headers: { Authorization: `Bearer ${settings.aiControlToken}` },
    });
  }
  const action = actionByTool[name];
  if (!action) throw new Error(`未知工具：${name}`);
  return callAction(action, args);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function toolResult(value, isError = false) {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
    isError,
  };
}

async function handle(message) {
  if (!message || message.jsonrpc !== "2.0") return;
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    });
    return;
  }
  if (message.method === "ping") {
    send({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools } });
    return;
  }
  if (message.method === "tools/call") {
    try {
      const result = await callTool(message.params?.name, message.params?.arguments || {});
      send({ jsonrpc: "2.0", id: message.id, result: toolResult(result) });
    } catch (error) {
      send({ jsonrpc: "2.0", id: message.id, result: toolResult(error instanceof Error ? error.message : String(error), true) });
    }
    return;
  }
  if (message.id !== undefined) {
    send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } });
  }
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  while (input.includes("\n")) {
    const newline = input.indexOf("\n");
    const line = input.slice(0, newline).trim();
    input = input.slice(newline + 1);
    if (!line) continue;
    try {
      void handle(JSON.parse(line));
    } catch (error) {
      console.error("Invalid MCP message", error);
    }
  }
});
