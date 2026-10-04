# Windows 1.1.12 发布前授权检查

检查日期：2026-10-05。范围：当前 Windows 源码、本地 `release/win-unpacked` 打包目录，以及 `Resources-Manager-1.1.12-windows-x64-setup.exe` 的对应打包内容。此文件记录技术核查结果，不是对所有权利的法律担保。

## 结论

当前安装包尚不满足本次检查的发布条件。可以把自有源码改动推送到 Windows 分支供协作审阅；公开分发安装包前，应修复第三方授权文件遗漏，明确 GPL/LGPL 组件的分发方式，并准备与实际二进制匹配的对应源码及构建信息。免费提供、公开仓库、预发布标签均不能代替这些要求。

听页源码的权利人已确认拥有版权或明确发布授权。听页独立项目尚未发布，用户要求不再检查其完整项目；这里只检查移植到资源管理器的模块及其实际运行时。

## 发现

| 项目 | 实际证据 | 发布前处理 |
| --- | --- | --- |
| Kokoro v1.1 中文模型 | 随包 `model/LICENSE` 是 Apache-2.0；原始模型页亦标注 Apache-2.0 | 保留模型许可证；模型许可不能覆盖音素引擎的 GPL 许可 |
| sherpa-onnx 1.13.8 / eSpeak NG | `sherpa-onnx-c-api.dll` 和 `_sherpa_onnx.cp313-win_amd64.pyd` 均含 `espeak_Initialize`、`espeak-ng`、`phonemize` 标记；v1.13.8 构建配置引入 piper-phonemize；上游确认该链包含 GPL 的 eSpeak NG | 不能仅按 sherpa-onnx 的顶层 Apache-2.0 标签分发；核实各组件版本、许可兼容性、完整对应源码和构建配置。GPL 不自动意味着整个 Electron UI 必须采用 GPL，需要结合链接/进程边界判断 |
| Node 24.19.0 | 独立 `resources/node` 只含 `node.exe`，没有 Node 的 LICENSE | 保留匹配此版本的完整 Node 许可证及其中第三方声明 |
| React / SQLite / sharp 等 | standalone 内找到 34 个 package.json；其中 30 个包目录未找到顶层 LICENSE/NOTICE/COPYING。许多源码 node_modules 中存在相应文件，但打包后丢失 | 从准确版本的依赖恢复授权文件，递归保留内置第三方声明；目录缺少文件是构建遗漏证据，不单独等于整个安装包完全没有该声明 |
| sharp / libvips | Windows 包的 license 为 `Apache-2.0 AND LGPL-3.0-or-later`，WASM 包还包含 MIT | 补全 LGPL/GPL 正文、所覆盖组件对应源码和可替换/重新链接所需材料；不把整个包误标为仅 Apache-2.0 |
| jschardet 3.1.4 | 已安装包声明 `LGPL-2.1+`，不能套用较新 jschardet 4 的 0BSD 标签 | 对打包进服务器代码的版本保留通知并满足其源码、替换或重新链接条件 |
| JSZip 3.10.1 | `MIT OR GPL-3.0-or-later` | 可选择 MIT 许可路径并保留原始 MIT 声明，不能将 OR 误解成必须同时满足两种许可 |
| Python / NumPy / OpenCC / sherpa-onnx 顶层 | Python LICENSE 和相关 dist-info 授权文件保留在包内；NumPy 文件还包含其捆绑组件的许可文本 | 继续保留；这不能替代 eSpeak 等遗漏组件的独立通知和源码要求 |
| PDF.js worker | `public/pdf.worker.min.mjs` 保留 Mozilla Foundation 的 Apache-2.0 头部声明 | 同时保留 PDF.js 完整许可证和其适用的第三方声明 |
| 图标和演示截图 | 存在 app-icon、应用图标、README 演示截图；未找到明确的素材来源/授权清单 | 不能仅凭图片外观判定权利；确认素材由权利人创作或获授权，展示内容也应使用获授权或自制样例 |
| 项目自身许可 | 仓库根目录没有 LICENSE | “免费提供”不等于选择了开源许可证；整体许可由权利人决定。本次不擅自给项目改为 GPL/MIT |

## 其他检查及限制

- 检查的源文件中未检出常见私钥、GitHub token、云访问密钥格式。该模式检查不是完整秘密扫描。
- `git ls-files data runtime/kokoro/bundle release` 没有结果；运行时模型、安装包和用户书库未进入版本控制。
- 源目录中读取到 117 个已安装的生产依赖 package.json；这不等于完整软件物料清单，Next 内置编译模块和二进制内部依赖需另行核对。
- 本机用户小说、漫画、照片、视频不应加入 Release、源代码或示例。网页导入功能不授予用户对第三方作品的传播权。
- 未检查听页独立项目的代码、图标和安装包，也不对其未提供的内容作无侵权结论。
- 当前 Windows 安装包 SHA256：`58EC175D94391371E56EE59DD160D8523CB44BB61935695D055917EB05B7604A`。补齐授权后重新打包应生成新的校验文件；不把旧包称为已修复。

## 处理方案

1. 保留听书功能：确认 GPL 组件覆盖范围及权利人选择的兼容许可方案，补全对应源码、构建信息、第三方通知，重新打包并验证。仅添加 GPL 文本、源码网页链接或免责声明不足以证明已满足所有要求。
2. 调整听书引擎：使用已验证不含 GPL 组件且许可兼容的构建，或明确独立的外部引擎边界；切换前需要验证语音功能。仅让用户另行下载旧引擎，不应自动宣称已经解决许可问题。

## 上游来源

- [Kokoro-82M-v1.1-zh 模型页](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh)
- [sherpa-onnx 上游 GPL 依赖说明](https://github.com/k2-fsa/sherpa-onnx/issues/3731)
- [sherpa-onnx v1.13.8 piper-phonemize 构建配置](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.8/cmake/piper-phonemize.cmake)
- [eSpeak NG 许可说明](https://github.com/espeak-ng/espeak-ng#license-information)
- [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html)
- [GNU LGPL v3](https://www.gnu.org/licenses/lgpl-3.0.html)
- [Apache-2.0 再分发条款](https://www.apache.org/licenses/LICENSE-2.0.html)
