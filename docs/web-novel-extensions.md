# 用户安装的网页扩展

公开版默认不启用网页小说抓取，也不附带第三方小说站点预设。网页能力以可卸载的
声明式 JSON 扩展提供；只有安装后才出现链接输入和导入按钮。
扩展保存在当前工作区，不自动传播到其他工作区。

来源状态与说明由扩展发布者填写，程序不判断或核验一部作品的版权状态。
未知状态可以如实标注，不应把参考章节链接当作已取得许可的证明。

## 安装和移除

在「小说 → 导入 → 网页扩展」可安装原创示例，或选择自行取得的 JSON / ZIP，核对访问范围与来源声明后确认。
新版的「创建站点扩展」支持填写 HTTPS 来源、正文、章节标题、书名、目录与下一章 CSS 选择器，校验后安装或导出 JSON。
来源状态、说明与 HTTPS 参考链接必填。未知来源可以选择 `unverified`（未核实），如实说明情况后仍可安装，不要求冒称原创或已取得许可。参考链接可以是章节或来源说明页，不会自动把第三方站点标为已授权。

- [下载原创示例 ZIP](https://github.com/JerryDoko/Resources_manager/releases/download/v1.2.0/Resources-Manager-Web-Extension-Demo-1.0.0.zip)
- [下载原创示例 JSON](https://github.com/JerryDoko/Resources_manager/releases/download/v1.2.0/Resources-Manager-Web-Extension-Demo-1.0.0.json)
- [示例内容与 MIT 授权](web-extension-demo/README.md)
- [安装与常见错误](novel-install-help.md)

v1.2.0 安装包仅支持 JSON：先解压 ZIP，再选根目录 `manifest.json`。v1.2.1 支持直接安装 ZIP。
示例只适配仓库原创短篇《灯塔来信》，不适配第三方小说网站。示例安装不联网执行程序，导入章节需要联网；听书另需引擎与模型。
ZIP 根目录仅允许 `manifest.json`、`README.md`、`GUIDE.md`、`LICENSE`，最多 4 个文件，总包不超过 256 KB，JSON 解压后不超过 32 KB，不允许子目录、脚本或符号链接。

点击「移除扩展」后停止新网页下载，已保存的书籍、章节和进度不删除。
未安装时，包括旧书的自动续章在内，任何未保存章节都不会联网下载。
已保存章节、本地 TXT/EPUB 的跨章阅读和听书不受影响。

## 协议

这是给站点作者的格式示例，不是可直接用于第三方小说站的下载器。
`example.org` 是文档示例域名，页面必须由作者另行提供。

```json
{
  "format": "resources-manager.web-novel.v1",
  "id": "my-original-stories",
  "name": "我的原创故事",
  "version": "1.0.0",
  "license": "MIT",
  "authorization": {
    "basis": "own-content",
    "statement": "此站点由故事作者运营，站内原创内容获准保存至个人资源库并朗读。",
    "reference": "https://example.org/rights"
  },
  "origins": ["https://example.org"],
  "selectors": {
    "content": "article",
    "title": "h1",
    "bookTitle": "header .book-title",
    "bookLink": "a[rel=index]",
    "next": "a[rel=next]"
  }
}
```

`basis` 可为 `unverified`（未核实）、`own-content`（原创）、`permission`（获准）、`public-domain`（公版）。`unverified` 需要 v1.2.1 或更新版本，v1.2.0 的旧校验器不认识此值；不要用虚假的 `permission` 兼容旧包。
`license` 描述扩展本身的许可，不代表小说自动获准再发布。
所有选择器使用 CSS；书名元素也支持 meta 元素的 content 属性。
bookLink/next 可省略。书籍目录链接是稳定去重键，建议站点作者提供。
来源必须是 HTTPS 标准端口；每次重定向、目录链接和下一章都重新检查来源。
不支持脚本、Cookie、自定义请求头、认证、验证码或付费绕过，拒绝本机与内网地址。

## 适配和排错

1. 先确认内容允许相关保存与朗读，再检查一条公开章节页的 HTML。不要发布未经核实的许可声明。
2. 正文、章节标题、书名三个选择器必须命中。正文用最小的章节容器，避免整个 body 包含菜单和广告。书名可以取 meta 的 content 属性。
3. 目录、下一章选择器指向带 href 的链接；同一本书的目录链接必须保持一致，用于去重。
4. 在原站被拒绝、要求登录或出现验证码时停止，不靠扩展绕过限制。
5. www 与非 www 是不同来源，跨域重定向与下一章来源都需要显式列出。来源是整个域名范围，不是单条页面的授权证明。
6. 页面结构变更会使规则失效。更新扩展后再测试当前章、下一章、最后一章和重复导入；安装规则不会自动重复导入已经保存的书籍。

主程序不内置第三方站点预设和作品正文。站点规则放在独立扩展项目中，单独打包、安装、更新与移除；现有通用网页下载、导入、去重、跨章阅读与听书逻辑保留在主程序。当前扩展包是声明式数据，不是独立抓取进程或可执行小程序。
