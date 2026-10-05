import JSZip from "jszip";
import demo from "./extension-demo.json";
import { validateWebExtension } from "./web-extensions";

export const EXTENSION_PACKAGE_LIMIT = 256 * 1024;
const JSON_LIMIT = 32 * 1024;
const files = new Set(["manifest.json", "README.md", "GUIDE.md", "LICENSE"]);
function parseManifest(text: string) {
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw new Error("扩展文件不是有效 JSON，请检查 manifest.json"); }
  return validateWebExtension(value);
}
const guide = `# 网页扩展示例包 1.0.0

这是《灯塔来信》两章原创示例的适配包，不是通用小说网站下载器。
示例文本、适配规则和本包文档按 MIT 授权。

## 安装

Resources Manager 新版：小说导入 → 网页扩展 → 从文件安装，选择本 ZIP 或 manifest.json，核对来源和访问范围后确认。
v1.2.0：先解压 ZIP，点击“安装网页扩展”并选择 manifest.json。
无需运行脚本、安装 Python 或导入声音包即可导入和阅读网页。
扩展只在当前工作区生效；重新安装不会清除已保存的书籍。

## 试读

安装后导入以下章节链接；阅读或听书时可以自动接续第二章。
https://raw.githubusercontent.com/JerryDoko/Resources_manager/main/docs/web-extension-demo/chapter-1.html
网页下载需要联网；听书另需安装本地引擎和 Kokoro 模型。

## 其他网站

本包不能直接适配其他站点。请取得内容使用许可，再按该站点页面修改 manifest.json 的 origins、selectors 和 authorization。
不能配置脚本、登录凭证、Cookie、付费绕过或验证码绕过。扩展声明不代表应用已核验网站授权。
允许来源按整个 HTTPS 域名匹配；示例访问范围是 raw.githubusercontent.com，不代表该域名所有内容都可使用。

## 帮助

应用内离线指南：小说导入 → 安装与排错指南。
在线扩展指南：https://github.com/JerryDoko/Resources_manager/blob/main/docs/web-novel-extensions.md
声音包与性能：https://github.com/JerryDoko/Resources_manager/blob/main/docs/kokoro-package-performance.md

网页未匹配正文：检查章节链接和 CSS 选择器；不要把登录页或目录页当章节。
Failed to fetch / 无法连接本地服务：重新启动应用并点“重新连接”，检查本地服务日志；不是缺少扩展或声音包。
声音包目录应包含 model.onnx 或 model.int8.onnx、voices.bin、tokens.txt、词典、FST 和 espeak-ng-data；不是包含 catalog.json 的 Books 目录。
听书引擎找不到 Python：安装 Python 3.11 或以上并重启应用，随后下载独立听书引擎。
下载失败：在浏览器从官方地址下载模型、解压，再选择目录导入；不要运行来源不明的脚本。
`;
const license = `MIT License

Copyright (c) 2026 JerryDoko

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

export async function buildExampleExtensionPackage() {
  const zip = new JSZip();
  const options = { date: new Date("2026-10-05T00:00:00Z") };
  zip.file("manifest.json", JSON.stringify(validateWebExtension(demo), null, 2) + "\n", options);
  zip.file("README.md", guide, options);
  zip.file("LICENSE", license, options);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function parseExtensionPackage(data: Buffer, name: string) {
  if (data.length > EXTENSION_PACKAGE_LIMIT) throw new Error("扩展包不能超过 256 KB");
  if (name.toLowerCase().endsWith(".json")) {
    if (data.length > JSON_LIMIT) throw new Error("扩展 JSON 不能超过 32 KB");
    return parseManifest(data.toString("utf8"));
  }
  if (!name.toLowerCase().endsWith(".zip")) throw new Error("请选择 JSON 或 ZIP 扩展包");
  const zip = await JSZip.loadAsync(data);
  const entries = Object.values(zip.files);
  if (!entries.length || entries.length > files.size) throw new Error("扩展包文件数量不符合要求");
  for (const entry of entries) {
    const original = (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName;
    const mode = Number(entry.unixPermissions) & 0o170000;
    if (entry.dir || !files.has(entry.name) || (original && original !== entry.name) || (mode && mode !== 0o100000)) {
      throw new Error("扩展包只允许根目录的 manifest.json、README.md、GUIDE.md 和 LICENSE，不允许脚本或链接");
    }
  }
  const manifest = zip.file("manifest.json");
  if (!manifest) throw new Error("扩展包缺少根目录 manifest.json");
  // Bound decompression instead of trusting ZIP metadata or extracting files to disk.
  const stream = manifest.nodeStream("nodebuffer");
  const chunks: Buffer[] = []; let size = 0;
  const text = await new Promise<string>((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > JSON_LIMIT) { stream.pause(); reject(new Error("扩展 JSON 不能超过 32 KB")); return; }
      chunks.push(chunk);
    }).on("error", reject).on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))).resume();
  });
  return parseManifest(text);
}
