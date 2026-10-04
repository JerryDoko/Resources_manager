const fs = require("fs");
const path = require("path");

function readProfilesRegistry(root) {
  const file = path.join(root, "profiles.json");
  if (!fs.existsSync(file)) return null;
  const registry = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(registry.profiles)) return null;
  return registry;
}

function mergeLegacyProfileData(destination, legacyRoots, logger = console) {
  fs.mkdirSync(destination, { recursive: true });
  for (const source of legacyRoots) {
    if (path.resolve(source) === path.resolve(destination)) continue;
    let sourceRegistry;
    try {
      sourceRegistry = readProfilesRegistry(source);
    } catch (error) {
      logger.warn(`[rm] 无法读取旧配置 ${source}`, error);
      continue;
    }
    if (!sourceRegistry) continue;

    const destinationRegistry = readProfilesRegistry(destination);
    if (!destinationRegistry) {
      fs.cpSync(source, destination, { recursive: true, force: false });
      logger.log(`[rm] 已迁移旧数据 → ${destination}`);
      continue;
    }

    const existingIds = new Set(destinationRegistry.profiles.map((profile) => profile.id));
    const deletedIds = new Set(destinationRegistry.deletedProfileIds || []);
    let changed = false;
    for (const profile of sourceRegistry.profiles) {
      if (!profile?.id || !/^[a-zA-Z0-9_-]+$/.test(profile.id) ||
          existingIds.has(profile.id) || deletedIds.has(profile.id)) {
        continue;
      }
      const sourceProfileDir = path.join(source, "profiles", profile.id);
      const destinationProfileDir = path.join(destination, "profiles", profile.id);
      if (!fs.existsSync(sourceProfileDir)) continue;

      fs.mkdirSync(path.dirname(destinationProfileDir), { recursive: true });
      fs.cpSync(sourceProfileDir, destinationProfileDir, {
        recursive: true,
        force: false,
      });
      destinationRegistry.profiles.push(profile);
      existingIds.add(profile.id);
      changed = true;
      logger.log(`[rm] 已导入旧配置：${profile.name || profile.id}`);
    }

    if (changed) {
      fs.writeFileSync(
        path.join(destination, "profiles.json"),
        JSON.stringify(destinationRegistry, null, 2),
        "utf8"
      );
    }
  }
}

module.exports = { mergeLegacyProfileData };
