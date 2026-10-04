const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { mergeLegacyProfileData } = require("../electron/profile-migration.cjs");

const filename = path.resolve(__dirname, "../src/lib/profiles.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const profileModule = new Module(filename, module);
profileModule.paths = module.paths;
profileModule._compile(compiled, filename);
const profiles = profileModule.exports;
const quietLogger = { log() {}, warn() {} };

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rm-profile-migration-"));
  const destination = path.join(root, "current");
  const legacyRoots = [path.join(root, "Electron"), path.join(root, "Resources Manager")];
  const previousData = process.env.RESOURCES_MANAGER_DATA;
  process.env.RESOURCES_MANAGER_DATA = destination;
  t.after(() => {
    if (previousData === undefined) delete process.env.RESOURCES_MANAGER_DATA;
    else process.env.RESOURCES_MANAGER_DATA = previousData;
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { destination, legacyRoots };
}

function seed(root, ids) {
  fs.mkdirSync(root, { recursive: true });
  const registry = {
    version: 1, activeId: ids[0], defaultId: ids[0],
    profiles: ids.map(id => ({ id, name: id, createdAt: 1 })),
  };
  fs.writeFileSync(path.join(root, "profiles.json"), JSON.stringify(registry));
  for (const id of ids) {
    const dir = path.join(root, "profiles", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "library.db"), `original-${id}`);
  }
}

test("first launch migrates legacy profiles without changing the source", t => {
  const { destination, legacyRoots } = fixture(t);
  seed(legacyRoots[0], ["default", "demo"]);
  seed(legacyRoots[1], ["demo", "other"]);
  const source = fs.readFileSync(path.join(legacyRoots[0], "profiles.json"), "utf8");
  mergeLegacyProfileData(destination, legacyRoots, quietLogger);
  assert.deepEqual(profiles.listProfiles().profiles.map(p => p.id), ["default", "demo", "other"]);
  assert.equal(fs.readFileSync(path.join(destination, "profiles/demo/library.db"), "utf8"), "original-demo");
  assert.equal(fs.readFileSync(path.join(legacyRoots[0], "profiles.json"), "utf8"), source);
});

test("deleted legacy profiles stay deleted through repeated cold launches and registry edits", t => {
  const { destination, legacyRoots } = fixture(t);
  seed(destination, ["default", "demo"]);
  for (const source of legacyRoots) seed(source, ["default", "demo"]);
  profiles.deleteProfile("demo");
  profiles.renameProfile("default", "Renamed");
  const added = profiles.createProfile("New");
  profiles.setActiveProfile(added.id);
  profiles.setDefaultProfile(added.id);
  for (let boot = 0; boot < 3; boot++) {
    mergeLegacyProfileData(destination, legacyRoots, quietLogger);
    profiles.applyDefaultOnBoot();
    const registry = profiles.listProfiles();
    assert.equal(registry.profiles.some(p => p.id === "demo"), false);
    assert.deepEqual(registry.deletedProfileIds, ["demo"]);
    assert.equal(fs.existsSync(path.join(destination, "profiles/demo")), false);
  }
  assert.equal(fs.readFileSync(path.join(legacyRoots[0], "profiles/demo/library.db"), "utf8"), "original-demo");
  seed(legacyRoots[1], ["default", "demo", "new-legacy"]);
  mergeLegacyProfileData(destination, legacyRoots, quietLogger);
  assert.equal(profiles.listProfiles().profiles.some(p => p.id === "new-legacy"), true);
  assert.equal(profiles.listProfiles().profiles.some(p => p.id === "demo"), false);
});

test("deleting the active default profile keeps a valid fallback after migration", t => {
  const { destination, legacyRoots } = fixture(t);
  seed(destination, ["default", "remaining"]);
  seed(legacyRoots[0], ["default", "remaining"]);
  const registry = profiles.deleteProfile("default");
  assert.equal(registry.activeId, "remaining");
  assert.equal(registry.defaultId, "remaining");
  mergeLegacyProfileData(destination, legacyRoots, quietLogger);
  assert.deepEqual(profiles.listProfiles().profiles.map(p => p.id), ["remaining"]);
  assert.equal(fs.existsSync(path.join(destination, "profiles/default")), false);
});

test("legacy flat database cannot recreate a deleted default profile", t => {
  const { destination } = fixture(t);
  seed(destination, ["default", "remaining"]);
  profiles.deleteProfile("default");
  const legacyDb = path.join(destination, "library.db");
  fs.writeFileSync(legacyDb, "legacy-flat-db");
  profiles.loadRegistry();
  assert.equal(fs.existsSync(path.join(destination, "profiles/default")), false);
  assert.equal(fs.readFileSync(legacyDb, "utf8"), "legacy-flat-db");
});

test("last profile deletion remains blocked without changing the registry", t => {
  const { destination } = fixture(t);
  seed(destination, ["default"]);
  assert.throws(() => profiles.deleteProfile("default"), /至少保留一个配置/);
  assert.equal(profiles.listProfiles().deletedProfileIds, undefined);
  assert.equal(fs.existsSync(path.join(destination, "profiles/default/library.db")), true);
});
