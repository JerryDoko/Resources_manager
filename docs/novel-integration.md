# 听页整合实施与验收记录

> 以下包含 v1.1.11 的历史验收记录。v1.2.0 开源版不再携带语音二进制或模型，
> 网页读取改为默认关闭的用户安装扩展；当前分发边界见 README 与 THIRD-PARTY-NOTICES。

执行依据：听页 `docs/resources-manager-novel-integration-plan.md`（2026-10-04）。
基线：Resources Manager 1.1.10，保留已有工作区删除/迁移的未提交修复。

## 实施顺序

1. TXT：移植朗读规则与原文分段，常驻 Kokoro，接入原小说阅读器。
2. 播放：前台优先、两段预取、唯一会话、精确进度与工作区隔离。
3. 网页：静态正文导入、续章、TXT 存档、听页旧书迁入。
4. EPUB：共享播放控制，保留图片及沙盒；PDF 保持阅读。
5. 部署：目标项目独立声音运行时，Mac 实测，Windows 脚本与验证边界。

## 数据约定

- `media_items.id` 是小说主标识，偏好合并存入 `metadata.novelPreferences`。
- `novel_sources`：item_id 主键/外键、唯一 source_key、来源类型及来源信息。
- `novel_chapters`：章节稳定 ID、item_id 外键、顺序、标题、原文、原文摘要、来源 URL、下一章 URL；同一本书同一 URL 唯一。
- `novel_reading_state`：item_id 主键/外键，章节 ID、chunkId、原文偏移和摘要、片段内秒数、分段版本、更新时间。
- `novel_chapter_progress`：item_id/章节 ID 联合主键、章节摘要、实际播放进度、片段偏移和秒数；详情页按章节显示。
- 新表在 Drizzle 定义和 SQLite 增量建表中保持一致，外键删除随资源索引级联；删除索引不删除原文件。
- 托管书籍位于工作区 `novels/<itemId>/chapters/` 和 `collection.txt`；扫描忽略章节内部目录。
- 音频位于工作区 `novel-audio/kokoro/`；模型和 Python 只读共享。
- 普通备份包含小说表；另提供携带正文的小说资料导出/恢复，以便跨机器重建托管 TXT。音频缓存可重新生成。

## 会话约定

服务端全局唯一有效会话，绑定 profileId/itemId/sessionId，切换或删除工作区前撤销。
客户端代号防止旧异步结果播放，跨窗口用 BroadcastChannel 立即停止旧音频，并通过服务端租约校验兜底。
同一正文与音色合成去重、缓存命中绕过队列；每次只向顺序 worker 提交一个任务。
暂停/跳转/换音色撤销会话，已运行任务只能生成对应缓存，不能写入已删除工作区。
首段完成即播放，然后滚动准备两段；章末提前下载下一章并准备开头，不提前改变正文。

## 使用与启动

从「小说 → 导入」直接选择「导入 TXT / EPUB」，或使用独立的「从网页导入」入口。导入本地书后留在导入页面，不自动进入听书；网页可选择「导入并阅读」。原有文件夹扫描与递归开关保留。桌面版通过原生文件选择器索引原文件，不修改它；浏览器版通过文件选择器复制文件到当前工作区 `novels/local-files/<sha256>/`，按内容去重，也可输入本机路径。

已有资源库中的 TXT/EPUB 默认进入阅读模式，听书是附加功能。TXT 保留自动/手动编码和字号，EPUB 保留目录、图片和滚动切章。PDF 仍走原阅读器，本轮不支持 PDF 听书。

单本书的详情页显示真实章节数量、逐章标题、字数、段数、续听位置和已读进度；点击章名定位该章，点击「继续阅读」恢复保存的位置。章节属于原 media item，不拆成重复资源条目。TXT 根据章标题分章，没有标题的文本显示为「正文」；EPUB 按其目录分章；下载和迁入的书籍按保存的章节记录显示。

点击阅读器右上角「听书」后显示底部播放栏，包含播放、前后段、静音和设置；点击「阅读」收起播放栏并暂停。纯阅读时空格不启动朗读、无声音包提示或朗读高亮，不强制跟随朗读滚动。设置面板包含引擎、100 个中文音色、试听、0.75/1/1.25/1.5/2 倍速、音量、跟随原文及恢复默认。音量/倍速实时生效，不重复合成。首次点击播放后才发声；关闭阅读器停止播放并保存位置。

听书模式右上角「悬浮播放器」打开可拖动、可调整大小的置顶小窗，原窗口可以继续浏览书库。「展开阅读器」返回原文界面，音频实例不变；关闭小窗或主窗口停止朗读。悬浮页通过客户端 useEffect 发送初始化完成消息，主窗口校验来源与 origin 后才挂载播放器，避免在 Next 页面 hydration 前修改 body/宿主节点导致报错。置顶在 Electron 桌面版生效，普通浏览器的弹出窗口不能保证置顶。

开发启动（Electron 内置浏览器）：

```bash
cd /Users/hsx/Desktop/project/resources_manager/project
export PATH="$HOME/.nvm/versions/node/v20.15.1/bin:$PATH"
npm run resources:start
```

当前已构建 standalone；继续修改代码后先执行 `npm run build`，或使用 `npm run resources` 启动开发模式。端口被占用时 Electron 会选择其他空闲端口，不结束已有服务。

之前生成的本地安装包：`release/novel-integration/Resources-Manager-1.1.10-novel-integration-arm64.dmg`。应用：`release/novel-integration/mac-arm64/Resources Manager.app`。此包未包含后续的直接导入、阅读模式和 hydration 修复；本轮以源码启动验证，不把旧包当作已更新产物。版本保持 1.1.10，未创建 Git 标签、未推送 GitHub、未发布 Release。该包为 ad-hoc 签名的本地测试包，未做 Apple Developer ID 公证；深度签名验证通过不等于通过所有机器的 Gatekeeper 下载验证。

## 迁入旧书与备份

1. 在目标工作区进入「小说 → 导入 → 旧书迁入与备份 → 迁入听页书库」。
2. 选择包含 `catalog.json` 的 Books 目录，Mac 默认来源为 `~/Library/Application Support/Tingye/Books/`。
3. 检查书籍/章节数量，再点击「确认复制到当前工作区」。
4. 在原小说书架打开迁入的书。旧章节/片段位置按 Swift 的 grapheme 分段映射到原文锚点，不直接复用新分段索引；旧音频重新生成。

重复迁入按来源 ID/sourceKey/章节地址去重，已有位置和偏好不覆盖；旧 Books 目录不删除、不改写。普通设置备份含小说数据库正文、章节来源、偏好和进度，恢复后会重建托管 TXT。另有「导出托管小说 / 恢复托管小说」用于转移下载或迁入的正文和进度；不包含原本位于外部目录的 TXT/EPUB 文件，外部原文件需要另行备份。音频缓存不包含在备份内，可重建。

正式应用数据位于 `~/Library/Application Support/resources-manager/data/profiles/<profileId>/`。每个工作区的书籍、位置、设置和音频缓存隔离；模型与 Python 共享。切换工作区会使旧下载任务失效，即使随后切回也不能提交旧导入。

## 独立资源与 Windows

目标项目的资源准备入口是 `scripts/prepare-kokoro.mjs`，可从现有听页资源或独立离线包准备。资源已复制到本项目，安装包运行不读取听页目录。

```bash
npm run kokoro:prepare -- --from /Users/hsx/Desktop/project/litenovel_read
# 也可以 --from <包含 python/ 和 model/ 的离线目录>
```

Mac 声音资源：Python 3.13.16、sherpa-onnx 1.13.8、NumPy 2.5.3、OpenCC 0.1.7，完整 Kokoro v1.1 int8 模型/词典/FST/许可证。声音资源在 asar 外，Next standalone 排除声音目录，避免把 Windows 包和模型重复打入 Mac 包。每个平台记录文件 SHA256；相对符号链接保留为相对链接。

Windows x64 的 Python、DLL、模型和校验清单已准备，嵌入式 Python `_pth` 和 worker 自身目录已处理；Node/SQLite 打包禁止跨平台复用。Windows 构建与验证入口：

```powershell
# 在 Windows x64、Node 20 x64 环境中运行
powershell -ExecutionPolicy Bypass -File scripts/verify-windows-novel.ps1 -KokoroSource "D:\KokoroOffline"
```

该离线目录需包含 Windows `python/` 和 `model/`，脚本会安装依赖、校验 Python 模块、运行测试并生成 Windows 包。没有 Windows 主机，未实际执行此脚本、未生成或验证 Windows 安装包；不能据 Mac 结果宣布 Windows 播放、DLL、SQLite ABI 和退出清理通过。

声音包缺失时，小说导入面板提供下载模型、安装完整离线声音包、进度和失败重试。已验证离线包失败/重试/校验和安装后真实合成；未实际下载 GitHub 的完整模型压缩包。模型下载只支持保留的官方地址与 SHA256；Python 缺失时需完整离线包。系统中文语音是否可用/离线由宿主提供，本次未做系统语音实机验收。Android 未接入。

## 实际验收（2026-10-04）

环境：macOS Darwin 27.0.0，arm64；Electron 36.4.0；打包 Node 20.15.1、SQLite ABI 115。所有自动验收使用 `/tmp/rm-novel-*` 自建书库，未把用户正在使用的资源库或听页旧书库当测试数据。

- `npm run build` / `npm run pack:prepare`：通过，包括类型检查、Next standalone、Node/SQLite 自检。
- `npm run lint`：实际运行 `next lint`，无警告或错误。
- `npm run test:profiles`：5/5，通过并保留先前的配置删除/迁移修复。
- `npm run test:novel`：39/39。包括 18 个跨实现朗读规则、幂等性、Unicode 锚点、Swift grapheme 迁移、装饰空章、迟到任务取消、延迟续章、音频链接失效重试、去重、重置、旧新备份、隔离和删除、离线续章/回环、托管 TXT 重扫以及真实合成。
- 真实 Kokoro：女声/男声、24 kHz WAV、缓存命中、相同请求去重通过。最后一次实测首段音频约 3.46 秒、模型合成约 2.13 秒、含模型启动的首段等待约 3.45 秒；实际耗时随 CPU 和文本变化，2 倍速不保证任何设备均无等待。
- 实际 Electron：首段发声，实时 1.5 倍速/40% 音量，关闭重开恢复偏好，自动跨章和每章已读进度，悬浮/展开不重建音频，置顶，双窗口只有一个会话发声，通过。
- 原生文件选择导入 TXT；GB18030 正文与 24px 字号；EPUB 图片 naturalWidth、高亮和播放中滚动切章，通过。
- 指定网页通过真实后端下载第1830章和第1831章；并发重复导入只有一本，下一章复用稳定章节 ID，两个原文 TXT 与合集存在。静态 HTML、内网地址和回环另有固定测试，不依赖网站长期不变。
- 自建 PDF 两页实际 canvas 渲染/翻页、照片和漫画打开、用 MediaRecorder 生成的 VP8 视频实际播放，通过基础回归。不是对所有文件格式/编码的全面测试。
- 将 `.app` 复制到项目外 `/tmp/rm-novel-independent-final/` 后执行桌面验收，实际 Python 进程使用该副本 `Contents/Resources/kokoro`。证明运行资源不依赖来源项目目录。
- 正常关闭 Electron 后 Python PID 消失；另外强制结束 Node 父进程，Python 自动退出，通过。
- 在悬浮朗读状态关闭主窗口，子窗口随之关闭，应用退出且 Python 不遗留，通过。
- `electron-builder` Mac arm64 DMG 已真实生成；`codesign --verify --deep --strict` 通过。未公开上传应用、书库或音频。
- 最终 DMG 的 `hdiutil verify` 通过，SHA256：`d72cfe2a79181fc001e99f97b181b4f1af130f124e5b6a36239bbc05a0a01478`。

桌面验收脚本：`scripts/test-novel-desktop.mjs`。可通过 `RM_TEST_APP` 指向已打包应用可执行文件，`RM_TEST_WEB=1` 增加真实网站检查，`RM_TEST_MODE=dev` 验证开发模式 hydration；需要 Playwright，默认 `RM_PLAYWRIGHT` 使用当前 Codex 安装路径，可覆盖为其他 Playwright 模块路径。实际报告与截图保存在被 Git 忽略的 `test-results/novel/`。

过程中的失败已处理：同名 `URL` 变量遮蔽 URL 构造器导致悬浮窗口被阻止，已修复；Next 自动追踪声音资源导致重复打包及外链签名错误，已排除；一次与 SQLite 原生重建并发运行的测试因绑定文件暂时被移除而失败，构建完成后串行重跑 39 项通过。不要并发执行 `pack:prepare` 和依赖 SQLite 的源代码测试。资源 SHA256 清单对应准备时的离线原始包；Mac 打包时 native 文件还会经过 ad-hoc 签名。

### 导入与阅读模式修正

- 依据用户提供的开发模式堆栈，修复 `/novel-floating` hydration 前被主窗口插入播放器、修改 body 的问题；不使用 suppressHydrationWarning 掩盖错误。
- `npm run test:novel`：新增浏览器文件复制/内容去重/格式限制用例，40/40 通过。`npm run test:profiles` 仍为 5/5；新源码 `npm run build` 通过类型与 lint 检查。
- Electron 开发模式实际验收通过：默认阅读、空格不误启动、直接 TXT 导入、浏览器文件选择导入、阅读/听书切换暂停、悬浮与设置、同一音频展开、自动续章、唯一会话、EPUB 图片与滚动切章，以及 PDF/图片/漫画/视频基础回归；所有窗口运行时 errors 为空，退出后 Python 消失。
- 开发报告为 `test-results/novel/dev-desktop.json`。本轮未重打包或发布安装包。
- 新 standalone 构建的 Electron 实测也通过，另补测导入页原生选择 EPUB、两章详情和图片显示；所有窗口 errors 为空，Python 退出正常。报告为 `test-results/novel/desktop.json`。本轮未重复执行真实网站下载，网站解析/续章固定用例仍通过，上一轮的真实网站结果见前文。

### 最新 macOS 安装包（2026-10-04）

用户随后要求打包 Mac 和 Windows。已重新执行 `pack:prepare`、Mac arm64 DMG 构建，包含上述导入、阅读模式和 hydration 修复；没有覆盖旧安装包。

- DMG：`release/desktop-2026-10-04/Resources-Manager-1.1.10-novel-arm64.dmg`，约 464 MiB，版本保持 1.1.10。
- SHA256：`91d883b837818895a000ad506c7b3ad2acf0954def192c77163e6a5d96855b2b`。
- 深度 ad-hoc 签名验证与 `hdiutil verify` 通过；仍未做 Apple Developer ID 公证。
- 实际运行此包内的应用，默认阅读、直接 TXT/EPUB 导入、章节与图片、真实 Kokoro、实时音量/倍速、悬浮设置/展开、自动续章、双窗口会话、基础媒体回归全部通过；errors 为空，退出后 Python 消失。报告：`test-results/novel/packaged-desktop.json`。
- 当时 Windows 尚未生成；随后用户授权构建分支和 GitHub Actions，结果见下节。

### Windows CI 安装包（2026-10-04）

- 构建分支：`build/windows-novel-20261004`。安装包对应提交 `2ff83b283ddca3a79d4dbdfd8098314dbb29b010`，未修改远程 main，未发布 Release。
- 成功记录：https://github.com/JerryDoko/Resources_manager/actions/runs/37212219408 。Actions 产物保留 14 天，本地下载目录为 `release/desktop-2026-10-04/windows-x64/`。
- Windows Server 2022 x64、Node 20.15.1、内置 Python 3.13.7。官方 Python 和 Kokoro 模型压缩包均按固定 SHA256 校验；声音依赖版本固定在 `runtime/kokoro/requirements.txt`。
- `scripts/prepare-windows-kokoro.ps1` 自动下载、校验、组装离线环境；无需上传本地模型、书库或缓存。第一次构建在下载后停止推进，取消后改用 Python 标准库解压；第二次声音环境准备约 20 秒通过。
- 配置迁移测试 5/5，小说测试 40/40；真实中文女声/男声 WAV 合成、缓存复用、父进程结束后的 Python 退出全部通过。CI 首段含模型启动约 9.16 秒、合成约 6.74 秒，音频约 3.46 秒；不是实际扬声器输出测试。
- Next standalone 构建、原生 SQLite 编译通过。最终 `win-unpacked/resources` 内 Node/SQLite 建表以及 Python 加载 sherpa-onnx、NumPy、OpenCC 通过，不仅检查源码依赖。
- 安装版：`Resources-Manager-1.1.10-windows-x64-setup.exe`；SHA256：`a8f1bfb82271cdcd2df87e319ca8fbb8358ed1e41353b905fd0791770eb51a94`。
- 便携版：`Resources-Manager-1.1.10-windows-x64-portable.exe`；SHA256：`5a5a13c7ccf62a6d22f833c092c259441d0de6386ed91257cf60941ba305a705`。
- 没有配置 Windows 代码签名证书。未验证 Windows 10/11 实机安装、窗口操作、系统 TTS、扬声器音频输出和 SmartScreen 提示；不把 CI 测试当作这些实机验收。
- 本轮没有升级现有依赖主版本。CI 的 npm audit 仍报告 35 项依赖漏洞（4 moderate、29 high、2 critical），包括旧版 Next；需要另行处理并回归，不能把当前构建视为安全审计通过。

尚未做的实机项目：Windows 界面/安装/实际音频输出、系统 TTS、手机/Android、Apple 公证/其他 Mac 下载后的 Gatekeeper 验证，以及超大型 EPUB 的性能压力测试。网页仅支持无需登录的静态正文，不绕过验证码。

### v1.1.11 macOS 正式发布验收（2026-10-05）

- `package.json`、lockfile、应用 Info.plist 与 standalone server 的版本均为 1.1.11。
- 重新构建并通过 Next 类型/lint 检查、Node/SQLite 自检；配置测试 5/5、小说测试 40/40。
- 正式 DMG：`release/v1.1.11/Resources-Manager-1.1.11-arm64.dmg`。
- SHA256：`f1b856a0ba333282ba52ae3acd329902fee9fa35668dffd0e697b9dbaff7aedf`。
- 深度 ad-hoc 签名校验、`hdiutil verify` 均通过；没有 Apple Developer ID 公证。
- 实际运行该版本包内应用，通过直接 TXT/EPUB 与浏览器文件导入、阅读/听书切换、真实 Kokoro、偏好保存、悬浮设置/展开、自动跨章、章节进度、双窗口会话、EPUB 图片/滚动切章、文本编码/字号和 PDF/照片/漫画/视频基础回归；errors 为空，Python 子进程正常退出。
- 验收只使用隔离临时书库，报告为 `test-results/novel/packaged-desktop.json`。本轮不重复真实网站下载，不发布 Windows 产物。
- 发布说明：`docs/releases/v1.1.11.md`。安装包和校验文件是本次 macOS 发布资产，用户书库、缓存及私钥不包含在上传清单中。
