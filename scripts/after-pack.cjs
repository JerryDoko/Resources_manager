/**
 * electron-builder afterPack：强制拷贝完整 standalone（含 node_modules）
 * builder 默认会按 .gitignore 丢掉 node_modules
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

exports.default = async function afterPack(context) {
  const appName = context.packager.appInfo.productFilename;
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, `${appName}.app`, "Contents", "Resources")
      : path.join(context.appOutDir, "resources");

  const root = context.packager.projectDir;
  const serverSrc = path.join(root, "dist-pack", "server");
  const nodeSrc = path.join(root, "dist-pack", "node");
  const serverDest = path.join(resources, "server");
  const nodeDest = path.join(resources, "node");
  const arch = context.arch === 3 ? "arm64" : "x64";
  const target = `${context.electronPlatformName}-${arch}`;
  if(context.electronPlatformName !== process.platform || arch !== process.arch) throw new Error("必须在目标平台准备 Node/SQLite 并打包，禁止复用另一平台的 dist-pack");
  const kokoro = path.join(root,"runtime/kokoro");
  const { pathToFileURL } = require('url');
  const { assertVoiceRuntime, ENGINE_ID } = await import(pathToFileURL(path.join(kokoro,'runtime-safety.mjs')).href);
  if(!fs.existsSync(path.join(kokoro,"bundle",target,"manifest.json"))) throw new Error(`缺少 ${target} Kokoro 声音包，请先运行 prepare-kokoro`);
  const manifest=JSON.parse(fs.readFileSync(path.join(kokoro,'bundle',target,'manifest.json'),'utf8'));
  if(manifest.engine!==ENGINE_ID)throw new Error('声音包引擎不兼容，请重新准备后打包');
  assertVoiceRuntime(path.join(kokoro,'bundle',target));
  const licenses=path.join(root,'dist-pack/licenses');
  if(!fs.existsSync(path.join(licenses,'npm-inventory.json'))||!fs.existsSync(path.join(nodeSrc,'LICENSE')))throw new Error('缺少第三方授权，请运行 prepare-third-party.mjs 后再打包');
  fs.cpSync(licenses,path.join(resources,'licenses'),{recursive:true});
  const kokoroDest=path.join(resources,"kokoro");
  fs.mkdirSync(kokoroDest,{recursive:true});
  for(const file of ["kokoro_worker.py","ort_engine.py","narration.py","NOTICE.md","requirements.txt","install.mjs","runtime-safety.mjs","models.json"]) fs.copyFileSync(path.join(kokoro,file),path.join(kokoroDest,file));
  fs.cpSync(path.join(kokoro,"bundle",target),path.join(kokoroDest,"bundle",target),{recursive:true,verbatimSymlinks:true});
  if(fs.existsSync(path.join(kokoro,"manifests")))fs.cpSync(path.join(kokoro,"manifests"),path.join(kokoroDest,"manifests"),{recursive:true});

  if (!fs.existsSync(serverSrc)) {
    throw new Error(`afterPack: 缺少 ${serverSrc}，请先 npm run pack:prepare`);
  }
  if (!fs.existsSync(path.join(serverSrc, "node_modules"))) {
    throw new Error("afterPack: dist-pack/server 缺少 node_modules");
  }

  fs.rmSync(serverDest, { recursive: true, force: true });
  fs.cpSync(serverSrc, serverDest, { recursive: true, verbatimSymlinks: true });
  console.log(`[afterPack] 已拷贝 server → ${serverDest}`);

  if (fs.existsSync(nodeSrc)) {
    fs.rmSync(nodeDest, { recursive: true, force: true });
    fs.cpSync(nodeSrc, nodeDest, { recursive: true, verbatimSymlinks: true });
    const bin =
      context.electronPlatformName === "win32"
        ? path.join(nodeDest, "node.exe")
        : path.join(nodeDest, "bin", "node");
    if (fs.existsSync(bin)) fs.chmodSync(bin, 0o755);
    console.log(`[afterPack] 已拷贝 node → ${nodeDest}`);
  }

  if (context.electronPlatformName === "darwin") {
    const appPath = path.join(context.appOutDir, `${appName}.app`);
    execFileSync("xattr", ["-cr", appPath], { stdio: "inherit" });
  }
};
