/**
 * electron-builder afterPack：强制拷贝完整 standalone（含 node_modules）
 * builder 默认会按 .gitignore 丢掉 node_modules
 */
const fs = require("fs");
const path = require("path");

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

  if (!fs.existsSync(serverSrc)) {
    throw new Error(`afterPack: 缺少 ${serverSrc}，请先 npm run pack:prepare`);
  }
  if (!fs.existsSync(path.join(serverSrc, "node_modules"))) {
    throw new Error("afterPack: dist-pack/server 缺少 node_modules");
  }

  fs.rmSync(serverDest, { recursive: true, force: true });
  fs.cpSync(serverSrc, serverDest, { recursive: true });
  console.log(`[afterPack] 已拷贝 server → ${serverDest}`);

  if (fs.existsSync(nodeSrc)) {
    fs.rmSync(nodeDest, { recursive: true, force: true });
    fs.cpSync(nodeSrc, nodeDest, { recursive: true });
    const bin = path.join(nodeDest, "bin", "node");
    if (fs.existsSync(bin)) fs.chmodSync(bin, 0o755);
    console.log(`[afterPack] 已拷贝 node → ${nodeDest}`);
  }
};
