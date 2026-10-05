import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import demo from "../src/lib/novel/extension-demo.json";
import { buildExampleExtensionPackage } from "../src/lib/novel/extension-package";

async function main() {
  const directory = path.resolve("release/web-extension");
  fs.mkdirSync(directory, { recursive: true });
  const base = "Resources-Manager-Web-Extension-Demo-1.0.0";
  const outputs = [[`${base}.zip`, await buildExampleExtensionPackage()], [`${base}.json`, Buffer.from(JSON.stringify(demo, null, 2) + "\n")]] as const;
  for (const [name, data] of outputs) {
    fs.writeFileSync(path.join(directory, name), data);
    console.log(`${createHash("sha256").update(data).digest("hex")}  ${name}`);
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
