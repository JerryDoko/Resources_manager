# 素材来源

2026-10-05，Windows 分支按维护者要求替换来源不明的应用图标，并移除包含第三方漫画、视频、照片的旧演示截图。

- `public/app-icon.svg`：本项目自行绘制的几何图形，不使用第三方图像、字体或标识。
- `public/app-icon.png`、`build-resources/icon.*`：由上述 SVG 通过 `node scripts/prepare-original-icons.mjs` 生成。
- 新演示使用本项目自行编写的测试文本和绘制的图形，不把用户书库内容作为示例。
- Lucide UI 图标遵循其 ISC 许可；Next / Vercel 模板文件仍按各自许可保留，应用图标不使用这些标识。

旧截图和旧图标在本地工作目录备份，未加入这次发布文件。Git 历史和 main 分支的历史内容未在本次操作中重写；此说明不表示已经清理过往发布。
