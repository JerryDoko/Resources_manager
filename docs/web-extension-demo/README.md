# 原创网页扩展示例：灯塔来信

这里的两章短篇是为 Resources Manager 演示导入、阅读和自动续章而创作的原创示例，不是任何第三方小说的节选。文本、HTML、适配规则和文档均按仓库 MIT 许可证提供，可复制、修改、导入与朗读。

扩展只适配这里的页面结构，不是通用小说网站下载器。站点授权声明不是应用对其他内容版权的核验。

- [下载 ZIP 扩展包](https://github.com/JerryDoko/Resources_manager/releases/download/v1.2.0/Resources-Manager-Web-Extension-Demo-1.0.0.zip)
- [下载 JSON 扩展](https://github.com/JerryDoko/Resources_manager/releases/download/v1.2.0/Resources-Manager-Web-Extension-Demo-1.0.0.json)
- [扩展安装与制作指南](../web-novel-extensions.md)
- [第一章原始页面](https://raw.githubusercontent.com/JerryDoko/Resources_manager/main/docs/web-extension-demo/chapter-1.html)

v1.2.0 用户：解压 ZIP，选择 `manifest.json` 安装。带“安装原创示例扩展”按钮的新版可以直接安装，也可选择 ZIP 文件。

安装不会联网执行程序，不需要 Python。导入示例章节需要 GitHub 原始文件服务可访问；听书另需本地引擎和模型。

示例 HTML 使用 UTF-8 BOM，避免 v1.2.0 的旧自动编码识别把短篇中文误判为日文编码；新版会优先采用网页自身的编码声明。
