# Resources Manager

**本地一体化资源管理器** — 把散落在各处的漫画、条漫、小说、视频、音乐与照片，收进同一个私有库里。数据只存在你的电脑上，不上传云端，打开即用。

---

## Description

Resources Manager 是一款面向个人媒体与本地文件的桌面资源管理应用。你只需把文件夹加进库中，它会自动扫描、解析命名、按系列归组、生成缩略图，并提供统一的浏览、阅读与播放体验。

适用于：

- 想把漫画、视频、音乐、照片放在**同一套界面**里管理
- 重视**隐私**：内容不出本机，无遥测、无云同步你的文件
- 需要**智能整理**：`[作者] 标题` 解析、自动系列、标签与评分
- 希望在 Mac 上用**内置窗口**运行，关掉窗口即停止服务

---

## 功能概览

### 统一资源库
- 六种类型：**漫画 / 条漫 / 小说 / 视频 / 音乐 / 照片**
- 标题栏一键切换类型；按标题、作者、评分、更新时间、拍摄日期排序
- 搜索标题与作者；标签筛选（匹配全部 / 任一）

### 自动索引与整理
- 递归扫描本地文件夹（支持访达选路径）
- 解析 `[Author] Title`、`Author - Title` 等常见命名
- 话数/分集文件夹自动归入上一级系列
- 导入后生成 WebP 缩略图；可一键重新生成

### 漫画 · 条漫
- 文件夹图片与 `.zip` / `.cbz` 直读，无需解压
- 支持 **WebP / GIF 动图** 播放
- 翻页阅读、系列内连续浏览、**放映模式**（可调间隔）
- 图片按容器宽高较小边**等比适配**

### 小说
- **TXT**：多编码智能检测（UTF-8 / GBK / GB18030 / Shift_JIS / CP949 等），可手动改编码
- **EPUB**：目录侧栏 + 章节阅读
- **PDF**：页渲染、翻页与缩放

### 视频
- 本地流式播放，进度条可拖动（含缓冲指示）
- 画面等比适配（object-contain）
- 点按 ←/→ 跳转；长按右 **倍速**；长按左 **快退**
- `[` / `]` 切换上/下一个（可自定义，**一行为可绑多键**）
- A-B 循环、逐帧、截帧、外挂字幕（`.srt` / `.vtt`）
- 拍摄日历快捷条

### 音乐 · 照片
- 音乐：ID3 专辑/艺术家解析，底部 Dock 跨页续播
- 照片：系列浏览、左右切换，等比适配

### 标签 · 进度 · 备份
- 任意系列打标签、评分；阅读/观看进度写入本地库
- 一键备份/恢复：评分、标签、进度、设置（JSON）
- 存储：本机 SQLite（`./data/library.db`）

### 桌面启动
- `npm run resources`：内置浏览器窗口（Chrome/Edge 应用模式）
- **关闭全部内置窗口 → 自动停止后台服务**
- 可选 Electron 壳；也可用 `resources:web` 仅开 Web 服务

---

## 快速开始

```bash
# 推荐：内置窗口（关窗即停服）
npm run resources

# 或双击
scripts/Start\ Resources\ Manager.command

# 仅 Web（系统浏览器，关浏览器不停服）
npm run resources:web

# 生产模式 + 内置窗口
npm run resources:start
```

要求：本机已安装 **Chrome / Edge / Chromium**。  
可选 Electron：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm i -D electron`

启动后：右上角 **设置** → **访达** 选择媒体文件夹 → **添加并扫描**。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Next.js 15.1.6 · React 19 · TypeScript · Tailwind CSS |
| 数据 | better-sqlite3 · Drizzle ORM |
| 媒体 | sharp（缩略图）· pdfjs-dist · iconv-lite · jszip · music-metadata |
| 桌面 | Chrome/Edge `--app` 窗口 · 可选 Electron |

数据目录：`./data/`（数据库、缩略图）；浏览器配置：`.lm-browser-profile/`（已 gitignore）。

---

## 使用提示

- macOS 请使用绝对路径，例如 `/Users/你/Movies`
- 漫画推荐：`系列名/话数或图片`，或直接放 `.cbz`
- 音乐按专辑归组；视频按文件名/父文件夹归组
- 右键系列卡片可多选
- 视频快捷键在 **设置 → 视频快捷键** 中配置（支持多键绑定）

---

## 规划中

- 拍摄日期完整日历 + GPS 地图
- 重复视频检测（含转码副本）
- 本地 AI 气泡翻译（离线）
- `*.resourcesmanager.app` 一键远程隧道
- 视频帧缩略图

---

## License

Private / 个人使用。按你的仓库许可为准。
