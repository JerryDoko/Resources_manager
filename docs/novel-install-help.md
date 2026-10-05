# 小说扩展、声音包与安装排错

应用内入口：「小说 → 导入 → 安装与排错指南」，打开随 v1.2.1 安装的 `/help/novel` 页面；该帮助页可以断网阅读。v1.2.0 安装包不包含新帮助入口。

## 网页扩展

- [ZIP 下载](https://github.com/JerryDoko/Resources_manager/releases/download/v1.2.0/Resources-Manager-Web-Extension-Demo-1.0.0.zip)
- [JSON 下载](https://github.com/JerryDoko/Resources_manager/releases/download/v1.2.0/Resources-Manager-Web-Extension-Demo-1.0.0.json)
- [扩展安装与制作](web-novel-extensions.md)

示例只读取仓库原创短篇《灯塔来信》，不是通用网站适配包。新版可点击安装示例；v1.2.0 请解压 ZIP，选择 `manifest.json` 并确认。
本地 TXT / EPUB 不需要网页扩展，PDF 使用原有导入与阅读入口。卸载扩展不删除书籍，但未缓存网页章节不再自动下载。

## 本地听书

1. 从 [Python 官方网站](https://www.python.org/downloads/)安装 Python 3.11 或以上，重启应用。
2. 「小说导入 → 听书声音包 → 下载独立听书引擎」，确认第三方许可。引擎从 PyPI 安装，并非项目 MIT 代码。
3. 点「下载默认完整版」，或从 [Kokoro 官方说明](https://k2-fsa.github.io/sherpa/onnx/tts/all/Chinese-English/kokoro-multi-lang-v1_1.html)下载并完整解压。
4. 选择解压后模型目录，点击「导入声音包」。完整目录包含 `model.onnx` / `model.int8.onnx`、`voices.bin`、`tokens.txt`、词典、FST、LICENSE、`espeak-ng-data`。
5. 打开本地书，点击听书，调整音色、倍速和音量。

模型目录不是 Books，不应选择压缩包或模型的上级目录。导入不修改来源目录；校验失败会保留原声音包。安装后保留本机 Python，删除它会影响已安装的引擎。
模型和性能设置对所有工作区生效；书籍、缓存和续听进度按工作区隔离。

## 旧听页书库

「旧书迁入与备份」选择含 `catalog.json` 的 `Books`，先预览，再复制。原书库不修改，已有书籍不覆盖。普通 TXT / EPUB 应走「本地文件」入口。
「导出托管小说」的 JSON 用于恢复书籍；不要用扩展 JSON 或模型包恢复小说。

## 生成速度

低占用 1 线程、均衡最多 2、优先速度最多 4、自定义最高 32（受处理器上限约束）。建议分别测试 2 和 4，越多不一定越快。
测试不保存设置，不改变阅读进度。实时系数 = 生成耗时 / 音频时长，越小越快，小于 1 表示比正常播放快。模型加载另计，测试期间尽量暂停其他负载。
点击保存后下一段新生成应用新设置，已有缓存不会重新生成。
更多说明：[Kokoro 声音包与性能](kokoro-package-performance.md)。

## 常见错误

- **Failed to fetch / 无法连接本地服务**：重启应用并点重新连接；脚本启动时检查终端服务、端口和崩溃日志。浏览器无法连本地服务，与 GitHub / PyPI 下载失败是不同问题。不要反复导入书库。
- **找不到 Python**：安装 3.11+ 并重启；模型包不代替本机 Python，引擎安装还需要访问 PyPI。
- **模型缺文件或校验失败**：重新完整解压，选择真正包含 `model.onnx` 和 `voices.bin` 的目录；不要仅复制一个 ONNX 文件或选择 Books。
- **目录要求 catalog.json**：你进入了旧书迁入，不是声音包导入。TXT/EPUB、本地模型、旧 Books 各用自己的入口。
- **网页未授权访问**：核对当前工作区、安装的规则和域名，www 与非 www 分别声明；不要为消除错误盲目扩大访问范围。
- **未匹配正文**：检查是否章节页以及 CSS 是否命中，登录页/目录页不支持。站点变化需要发布者更新适配。
- **网站 403、429 或验证码**：停止请求，不绕过限制。可使用有权导入的本地文件。
- **ZIP 无效**：`manifest.json` 要在根目录，不允许外层文件夹、脚本或链接。v1.2.0 只支持解压后的 JSON。
- **安装包被系统拦截**：当前 Mac 包未经过 Apple Developer ID 公证，不能保证所有机器的 Gatekeeper 行为。核对官方 Release 和 SHA256，勿关闭全局安全保护。

此指南主要针对 macOS；Windows 的引擎安装和运行仍需在 Windows 机器上实际验证。
