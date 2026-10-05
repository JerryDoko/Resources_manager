# Kokoro 声音运行时

worker 和 narration 移植自作者自己的听页本地项目（2026-10-04），由作者授权按项目 MIT 许可证发布。

公开安装包仅分发项目自有的 worker、朗读规则和依赖版本说明，
不分发 Python、sherpa-onnx、eSpeak 数据、模型权重、音色、词典或 FST。
用户自行安装的第三方组件仍遵循各自许可证，不属于本项目 MIT 授权：

- sherpa-onnx 1.13.8：顶层 Apache-2.0，但本版含 GPL eSpeak 相关组件，不可只按 Apache 宣传整个运行时。
- eSpeak NG：GPL-3.0-or-later，https://github.com/espeak-ng/espeak-ng
- Kokoro v1.1 权重：以原始下载包中的 LICENSE 为准；这个许可证不替代包内其他组件的许可。
- Python：PSF 及其第三方许可，https://docs.python.org/3/license.html
- NumPy：BSD-3-Clause 及其第三方许可，https://numpy.org/doc/stable/license.html
- OpenCC Python：Apache-2.0，https://github.com/yichen0831/opencc-python

用户主动下载引擎从 PyPI 获得独立依赖，并在用户目录中运行。
源包和音频缓存不得放入公开安装包。完整包导入只复制本地数据，不执行模型目录中的脚本。
