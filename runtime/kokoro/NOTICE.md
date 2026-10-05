# Kokoro 声音运行时

worker 和 narration 移植自用户提供的听页源码（2026-10-04）。
模型 Kokoro v1.1 int8 为 Apache-2.0，完整 LICENSE 随 model 目录分发。
Python 为 PSF，许可证随独立 Python 发行版分发。
ONNX Runtime 为 MIT；NumPy 为 BSD，OpenCC 为 Apache-2.0。完整许可证和捆绑组件声明保留在 Python site-packages 的 dist-info 目录。
当前引擎为 kokoro-ort-lexicon-v1：直接使用 ONNX Runtime 和模型附带的中英文词典，不执行或分发 sherpa-onnx、eSpeak NG、piper-phonemize 或 espeak-ng-data。
旧声音包不能直接用于新版引擎，请选择原包里的 model 目录重新安装，或使用新版完整离线声音包。
检查记录见 docs/windows-release-license-audit.md；其旧安装包结论不代表重新构建后的安装包结论。
资源准备脚本生成 SHA256 清单，禁止把用户小说或音频缓存放入此目录。
