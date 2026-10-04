# Kokoro 声音运行时

worker 和 narration 移植自用户提供的听页源码（2026-10-04）。
模型 Kokoro v1.1 int8 为 Apache-2.0，完整 LICENSE 随 model 目录分发。
Python 为 PSF，许可证随独立 Python 发行版分发。
sherpa-onnx、NumPy、OpenCC 许可证保留在 Python site-packages 的 dist-info 目录。
资源准备脚本生成 SHA256 清单，禁止把用户小说或音频缓存放入此目录。
