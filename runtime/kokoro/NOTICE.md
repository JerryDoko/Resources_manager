# Kokoro 声音运行时

worker 和 narration 移植自用户提供的听页源码（2026-10-04）。
模型 Kokoro v1.1 int8 为 Apache-2.0，完整 LICENSE 随 model 目录分发。
Python 为 PSF，许可证随独立 Python 发行版分发。
sherpa-onnx、NumPy、OpenCC 许可证保留在 Python site-packages 的 dist-info 目录。
注意：以上是顶层组件许可，不是整个声音包的统一许可。当前 sherpa-onnx 1.13.8 二进制包含 eSpeak NG 代码，必须另外核对并履行 GPL 等第三方分发条件；不能仅按 Apache-2.0 发布声音包。
2026-10-05 发布前检查发现授权文件和对应源码准备仍有缺口，详见 docs/windows-release-license-audit.md。当前声音包不应当作已完成授权核查的发布产物。
资源准备脚本生成 SHA256 清单，禁止把用户小说或音频缓存放入此目录。
