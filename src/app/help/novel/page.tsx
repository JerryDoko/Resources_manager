import { BookOpen, Download, ExternalLink } from "lucide-react";
import { EXAMPLE_CHAPTER_URL, EXTENSION_GUIDE_URL, EXTENSION_RELEASE_URL } from "@/lib/novel/extension-downloads";

const link = "text-[var(--accent)] underline underline-offset-4 break-words";
const section = "scroll-mt-6 border-t border-[var(--line)] py-7 space-y-4";
export default function NovelHelpPage() {
  return <main className="min-h-dvh bg-[var(--paper)] px-5 py-8 text-[var(--ink)] sm:px-10">
    <div className="mx-auto max-w-3xl text-sm leading-7">
      <header id="start" className="pb-7"><div className="flex items-center gap-3"><BookOpen size={24}/><h1 className="text-2xl font-semibold">小说安装与排错</h1></div>
        <nav aria-label="帮助目录" className="mt-5 flex flex-wrap gap-x-5 gap-y-2">{[["web-extension","网页扩展"],["kokoro","本地听书"],["legacy","旧书迁入"],["performance","生成速度"],["troubleshooting","常见错误"]].map(([id,title])=><a key={id} href={`#${id}`} className={link}>{title}</a>)}</nav>
        <p className="mt-4">本页随应用安装，断网时仍能阅读。外部下载和在线文档需要联网。本地 TXT / EPUB 导入与阅读不需要网页扩展、Python 或声音包；PDF 使用原有资源库导入和阅读入口。</p>
      </header>
      <section id="web-extension" className={section}><h2 className="text-lg font-semibold">网页扩展</h2>
        <ol className="list-decimal space-y-2 pl-5"><li>在「小说 → 导入 → 网页扩展」选择「安装原创示例扩展」，核对访问范围和来源声明后确认。也可以下载 JSON / ZIP 后选择「从文件安装」。</li><li>示例仅适配仓库原创短篇《灯塔来信》，不是通用网站下载器。安装后章节链接自动填入，点击「导入网页」；未缓存的下一章会在阅读或听书时自动接续。</li><li>扩展只在当前工作区生效；安装新扩展会替换当前适配规则，但不删除书籍。移除扩展后已缓存章节仍可离线阅读，未缓存章节不再联网下载。</li></ol>
        <div className="flex flex-wrap gap-x-5 gap-y-2"><a className={`${link} inline-flex items-center gap-2`} href="/api/novel/extensions?format=zip" download><Download size={16}/>下载 ZIP（无需外网）</a><a className={link} href="/api/novel/extensions?format=json" download>下载 JSON</a><a className={link} href={EXTENSION_RELEASE_URL} target="_blank" rel="noreferrer">GitHub 下载</a></div>
        <p>已安装的 v1.2.0 只接受 JSON：解压 ZIP，再选择里面的 <code>manifest.json</code>。新版可直接选择 ZIP；ZIP 根目录仅允许 manifest.json、README.md、GUIDE.md、LICENSE，总大小不超过 256 KB，JSON 不超过 32 KB，不执行任何代码。</p>
        <p><a className={link} href={EXAMPLE_CHAPTER_URL} target="_blank" rel="noreferrer">示例第一章</a> · <a className={link} href={EXTENSION_GUIDE_URL} target="_blank" rel="noreferrer">在线扩展协议与站点适配指南</a></p>
        <p>其他站点通过单独的 JSON / ZIP 适配包安装，不限于原创示例。创建扩展时未知来源可选择「未核实来源授权」，如实填写来源情况和章节参考链接，确认后仍可安装；无需声称已经取得许可。MIT 只涵盖扩展代码，不代表第三方作品的许可。来源按完整 HTTPS 域名匹配，并非只限定单条链接；示例只访问 raw.githubusercontent.com。不要添加 Cookie、登录凭证、脚本、验证码或付费绕过。</p>
      </section>
      <section id="kokoro" className={section}><h2 className="text-lg font-semibold">本地 Kokoro 听书</h2>
        <ol className="list-decimal space-y-2 pl-5"><li>安装 <a className={link} href="https://www.python.org/downloads/" target="_blank" rel="noreferrer">Python 3.11 或以上</a>，重启应用。Mac 通常使用官方安装器，保留安装后的 Python，不要在听书引擎安装后删除它。</li><li>打开「小说导入 → 听书声音包」，点击「下载独立听书引擎」，确认第三方许可。首次从 PyPI 下载引擎需要网络；引擎不是本项目 MIT 授权的一部分。</li><li>点击「下载默认完整版」，或从 <a className={link} href="https://k2-fsa.github.io/sherpa/onnx/tts/all/Chinese-English/kokoro-multi-lang-v1_1.html" target="_blank" rel="noreferrer">官方 Kokoro 下载页</a>下载模型并解压，再选择「声音包目录 → 导入声音包」。</li><li>打开小说，点击「听书」。音色、倍速、音量在朗读设置中调整；首次生成需要加载模型，后续片段会预先准备。</li></ol>
        <p>选择解压后包含 <code>model.onnx</code>（或 model.int8.onnx）、<code>voices.bin</code>、<code>tokens.txt</code>、词典、FST、LICENSE 和 <code>espeak-ng-data</code> 的完整模型目录。不是压缩包文件，不是含 catalog.json 的 Books，也不是模型目录的上一级。导入只复制模型数据，不运行下载包中的 Python 或脚本，不修改原目录。</p>
        <p>模型与性能设置对所有工作区共享，书籍、音频缓存和续听进度按工作区隔离。替换声音包校验失败会保留原包。新版 macOS 为主要验证平台，Windows 安装与 Python 检测需以实际测试为准。</p>
        <a className={`${link} inline-flex items-center gap-2`} href="https://github.com/JerryDoko/Resources_manager/blob/main/docs/kokoro-package-performance.md" target="_blank" rel="noreferrer"><ExternalLink size={14}/>模型与性能在线说明</a>
      </section>
      <section id="legacy" className={section}><h2 className="text-lg font-semibold">迁入旧听页书库</h2>
        <p>在「旧书迁入与备份」选择包含 <code>catalog.json</code> 的 <code>Books</code> 目录，先预览书籍与章节数量，再确认复制到当前工作区。迁入不修改原书库，不覆盖已有书籍；迁入后旧网页章节的续章仍要求安装对应扩展。</p>
        <p>普通 TXT / EPUB 不走旧书迁入入口，直接使用「本地文件 → 导入 TXT / EPUB」。备份使用「导出托管小说」；恢复使用应用导出的 JSON，不能把模型包或扩展 JSON 当作小说备份。</p>
      </section>
      <section id="performance" className={section}><h2 className="text-lg font-semibold">生成速度与 CPU 线程</h2>
        <p>低占用 1 线程，均衡最多 2 线程，优先速度最多 4 线程，自定义 1 到处理器支持的上限（最高 32）。建议分别测试 2 和 4 线程，多线程不一定更快。</p>
        <p>「测试生成速度」使用固定中文文本和独立临时缓存，不修改阅读进度，也不会保存设置。实时系数 = 生成耗时 ÷ 音频时长，越低越快，小于 1 表示比正常播放更快。模型加载时间另列。暂停其他重负载任务后再比较。</p>
        <p>决定采用后点击「保存性能设置」。下一段新生成时应用，已经缓存的音频不会重新生成。测试或导入时先停止朗读，避免后台负载影响测速。</p>
      </section>
      <section id="troubleshooting" className={section}><h2 className="text-lg font-semibold">常见错误</h2>
        <dl className="space-y-5">{[
          ["Failed to fetch / 无法连接本地小说服务", "先重启 Resources Manager，再点击“重新连接”。脚本启动时检查终端服务是否仍在运行、端口是否正确；服务日志比这条浏览器提示更具体。检查扩展下载所需的外网与本机服务故障是两件不同的事。不要反复重新导入书库。"],
          ["找不到 Python 或引擎安装失败", "安装 Python 3.11+ 后重启应用，确认下载 PyPI 的网络可用，再重试“下载独立听书引擎”。模型目录不包含可替代本机 Python 的引擎。保留失败日志与 Python 版本，勿运行陌生安装脚本。"],
          ["声音包缺少文件 / 校验失败", "确认已完全解压，选择真正包含 model.onnx 和 voices.bin 的目录。不要仅复制单个模型文件，不要选择 Books。下载中断时重新下载完整压缩包，旧声音包不会因校验失败被删除。"],
          ["网页扩展未授权访问此站点", "核对当前工作区、已安装扩展和链接域名。www 与非 www 是不同来源，重定向、目录和下一章的域名都必须列入声明。不要为消除错误随意扩大范围。"],
          ["未匹配到正文 / 网站返回 403、429 或验证码", "先确认是章节页，不是目录或登录页。站点结构变化需要更新 CSS 选择器；访问被拒绝时停止重试，不绕过验证码、登录、收费或站点限制。可改为导入有权使用的本地文件。"],
          ["扩展 ZIP 无效", "ZIP 根目录应有 manifest.json，不要压成一层文件夹；只允许文档与声明文件，不允许代码、子目录或链接。v1.2.0 请先解压再安装 JSON。"],
          ["迁入时要求 catalog.json", "这个入口只迁入旧听页 Books 书库。声音模型去“听书声音包”导入，本地 TXT / EPUB 去“本地文件”导入。"],
        ].map(([title, body]) => <div key={title}><dt className="font-medium">{title}</dt><dd className="mt-1 text-[var(--ink-muted)]">{body}</dd></div>)}</dl>
      </section>
    </div>
  </main>;
}
