# 第三方软件、对应源码与重新链接

Windows 安装目录的 `resources/licenses` 保留 JavaScript 软件包的许可证与版权声明、原生图像库声明和 Node 授权；`resources/kokoro/bundle/win32-x64` 内保留 Python、Python 依赖与模型授权。Electron 的 `LICENSE.electron.txt` 与 `LICENSES.chromium.html` 位于安装目录。

听书引擎由项目的词典转换代码、ONNX Runtime（MIT）、NumPy（BSD，包含其他第三方声明）和 OpenCC（Apache-2.0）组成。模型遵循其目录中的 Apache-2.0 LICENSE。新声音包不包含 sherpa-onnx、eSpeak NG 或 piper-phonemize。

图像处理使用 sharp（Apache-2.0）和 libvips。Windows DLL 使用 LGPL-3.0-or-later，所包含库逐项列于 `resources/licenses/upstream/libvips-*/README.md` 与 `versions.json`。JSZip 采用其双重授权中的 MIT 选项。jschardet 3.1.4 采用 LGPL-2.1-or-later。

## 对应源码

界面中的 Fraunces 与 DM Sans 字体遵循各自的 SIL Open Font License，授权全文也在 `resources/licenses/upstream/fonts`。项目图标和当前示例小说由项目自行制作，来源说明位于 `docs/asset-sources.md`。

每次 Windows Release 在安装包旁提供 `Resources-Manager-1.1.12-windows-third-party-sources.zip`，包含 libvips 8.18.3 / 8.15.3 及其依赖源码、对应 Windows 构建脚本与补丁、固定 MXE 构建环境、sharp 和 jschardet 的源码。下载无需付费。源码清单与 SHA256 位于包内 `sources.json`；特殊归档的固定 Git 提交及重新归档说明也记录在清单中。

应用代码和构建入口见 [Windows 分支](https://github.com/JerryDoko/Resources_manager/tree/windows-resources-manager)。重建应用使用该 Release 标签的源码与 `npm ci`，然后按 Windows 使用说明准备声音包，再运行 `npm run release:win`。DLL 的构建参数见源码包内的 `REBUILD.md`。

## 修改 LGPL 组件

为满足所附 LGPL 库的要求，允许用户修改本应用以替换或重新链接这些库，并允许为调试此类修改进行逆向工程。此授权针对 LGPL 重新链接用途，不为项目所有其他代码另行指定开源许可证。

退出应用并备份安装目录后，可替换以下可写位置的兼容库：

- `resources/server/node_modules/@img/sharp-win32-x64/lib/libvips-42.dll`
- `resources/server/node_modules/next/node_modules/@img/sharp-win32-x64/lib/libvips-42.dll`

目录中的相关 DLL 应一起替换为同一版本构建。不要覆盖系统目录。新库须保持 sharp 需要的 ABI。安装包不使用完整性签名来阻止修改这些库。

jschardet 的 Node 接口为 `detect()`，源码包保留其完整 `src`、`dist`、构建脚本和许可。修改该包后，使用应用同一标签源码重新构建，即可重新生成使用修改版本的服务端代码。

上述声明不减少第三方许可证授予的权利。上游来源和版权通知按原样保留，源码包中的编译器或构建工具不作为应用运行时分发。免费提供软件不免除第三方授权义务。
