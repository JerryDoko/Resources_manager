/**
 * 多资料库配置（相互独立的 DB + 缩略图）
 * 注册表在 root/profiles.json；各配置数据在 root/profiles/<id>/
 */
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";

export interface ProfileMeta {
  id: string;
  name: string;
  createdAt: number;
}

export interface ProfilesRegistry {
  version: 1;
  activeId: string;
  defaultId: string;
  profiles: ProfileMeta[];
}

function getRootDataDir() {
  if (process.env.RESOURCES_MANAGER_DATA) {
    return process.env.RESOURCES_MANAGER_DATA;
  }
  return path.join(process.cwd(), "data");
}

function registryPath() {
  return path.join(getRootDataDir(), "profiles.json");
}

function profileDir(id: string) {
  return path.join(getRootDataDir(), "profiles", id);
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/** 把旧版扁平 data/library.db 迁到 profiles/default */
function migrateLegacyIfNeeded() {
  const root = getRootDataDir();
  const legacyDb = path.join(root, "library.db");
  const defaultDir = profileDir("default");
  const defaultDb = path.join(defaultDir, "library.db");

  if (fs.existsSync(legacyDb) && !fs.existsSync(defaultDb)) {
    ensureDir(defaultDir);
    fs.renameSync(legacyDb, defaultDb);
    for (const side of ["library.db-wal", "library.db-shm"]) {
      const src = path.join(root, side);
      if (fs.existsSync(src)) {
        fs.renameSync(src, path.join(defaultDir, side));
      }
    }
    const legacyThumbs = path.join(root, "thumbnails");
    const destThumbs = path.join(defaultDir, "thumbnails");
    if (fs.existsSync(legacyThumbs) && !fs.existsSync(destThumbs)) {
      fs.renameSync(legacyThumbs, destThumbs);
    }
  }
}

function writeRegistry(reg: ProfilesRegistry) {
  const root = getRootDataDir();
  ensureDir(root);
  fs.writeFileSync(registryPath(), JSON.stringify(reg, null, 2), "utf8");
}

export function loadRegistry(): ProfilesRegistry {
  migrateLegacyIfNeeded();
  const root = getRootDataDir();
  ensureDir(root);

  if (!fs.existsSync(registryPath())) {
    const now = Date.now();
    const reg: ProfilesRegistry = {
      version: 1,
      activeId: "default",
      defaultId: "default",
      profiles: [{ id: "default", name: "默认", createdAt: now }],
    };
    ensureDir(profileDir("default"));
    ensureDir(path.join(profileDir("default"), "thumbnails"));
    writeRegistry(reg);
    return reg;
  }

  const raw = JSON.parse(fs.readFileSync(registryPath(), "utf8")) as ProfilesRegistry;
  if (!raw.profiles?.length) {
    raw.profiles = [{ id: "default", name: "默认", createdAt: Date.now() }];
  }
  if (!raw.activeId || !raw.profiles.some((p) => p.id === raw.activeId)) {
    raw.activeId = raw.profiles[0].id;
  }
  if (!raw.defaultId || !raw.profiles.some((p) => p.id === raw.defaultId)) {
    raw.defaultId = raw.profiles[0].id;
  }
  for (const p of raw.profiles) {
    ensureDir(profileDir(p.id));
    ensureDir(path.join(profileDir(p.id), "thumbnails"));
  }
  return raw;
}

export function getActiveProfileId(): string {
  // 启动时可用环境变量覆盖（仍写入 registry 的 active 优先，除非明确指定）
  if (process.env.RESOURCES_MANAGER_PROFILE) {
    return process.env.RESOURCES_MANAGER_PROFILE;
  }
  const reg = loadRegistry();
  // 若有默认配置且尚未有会话覆盖，用 defaultId 作为冷启动 active
  // 实际 activeId 由 switch 维护；冷启动读 activeId，第一次安装等于 default
  return reg.activeId || reg.defaultId;
}

export function getProfileDataDir(profileId?: string): string {
  const id = profileId || getActiveProfileId();
  const dir = profileDir(id);
  ensureDir(dir);
  ensureDir(path.join(dir, "thumbnails"));
  return dir;
}

export function listProfiles() {
  return loadRegistry();
}

export function createProfile(name: string): ProfileMeta {
  const reg = loadRegistry();
  const id = randomBytes(4).toString("hex");
  const profile: ProfileMeta = {
    id,
    name: name.trim() || `配置 ${reg.profiles.length + 1}`,
    createdAt: Date.now(),
  };
  ensureDir(profileDir(id));
  ensureDir(path.join(profileDir(id), "thumbnails"));
  reg.profiles.push(profile);
  writeRegistry(reg);
  return profile;
}

export function renameProfile(id: string, name: string) {
  const reg = loadRegistry();
  const p = reg.profiles.find((x) => x.id === id);
  if (!p) throw new Error("配置不存在");
  p.name = name.trim() || p.name;
  writeRegistry(reg);
  return p;
}

export function setDefaultProfile(id: string) {
  const reg = loadRegistry();
  if (!reg.profiles.some((p) => p.id === id)) throw new Error("配置不存在");
  reg.defaultId = id;
  writeRegistry(reg);
  return reg;
}

/** 切换活动配置（仅写注册表；调用方需关闭并重开 DB） */
export function setActiveProfile(id: string) {
  const reg = loadRegistry();
  if (!reg.profiles.some((p) => p.id === id)) throw new Error("配置不存在");
  reg.activeId = id;
  writeRegistry(reg);
  return reg;
}

export function deleteProfile(id: string) {
  const reg = loadRegistry();
  if (reg.profiles.length <= 1) throw new Error("至少保留一个配置");
  if (!reg.profiles.some((p) => p.id === id)) throw new Error("配置不存在");

  reg.profiles = reg.profiles.filter((p) => p.id !== id);
  if (reg.activeId === id) reg.activeId = reg.defaultId === id ? reg.profiles[0].id : reg.defaultId;
  if (reg.defaultId === id) reg.defaultId = reg.profiles[0].id;
  if (!reg.profiles.some((p) => p.id === reg.activeId)) {
    reg.activeId = reg.profiles[0].id;
  }
  writeRegistry(reg);

  const dir = profileDir(id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return reg;
}

/** 应用启动时：若存在 defaultId，将 active 对齐到默认（可选） */
export function applyDefaultOnBoot() {
  const reg = loadRegistry();
  // 始终以 registry.activeId 为准；首次创建时 active=default
  // 「设为默认」只影响新会话偏好：这里把冷启动 active 设为 defaultId
  if (reg.defaultId && reg.defaultId !== reg.activeId) {
    // 用户期望：启动进入默认配置
    reg.activeId = reg.defaultId;
    writeRegistry(reg);
  }
  return reg;
}

/** 当前数据目录（供设置页展示） */
export function getStoragePaths() {
  const reg = loadRegistry();
  const root = getRootDataDir();
  const activeId = reg.activeId;
  const activeDir = profileDir(activeId);
  const activeProfile = reg.profiles.find((p) => p.id === activeId);
  return {
    rootDataDir: root,
    profilesRegistry: registryPath(),
    activeProfileId: activeId,
    activeProfileName: activeProfile?.name || activeId,
    activeProfileDir: activeDir,
    libraryDb: path.join(activeDir, "library.db"),
    thumbnailsDir: path.join(activeDir, "thumbnails"),
  };
}
