# 用户安装的网页扩展

公开版默认不启用网页小说抓取，也不附带小说站点预设。网页能力以可卸载的
声明式 JSON 扩展提供；只有安装后才出现链接输入和导入按钮。
扩展保存在当前工作区，不自动传播到其他工作区。

插件并不能代替来源授权。发布者必须确认站点和内容允许相关读取、保存与朗读；
授权声明仅由发布者提供，程序不能判断一部作品在所有司法地区的版权状态。

## 安装和移除

在「小说 → 导入 → 网页扩展」选择自行取得的 JSON 文件，核对访问范围并确认。
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

`basis` 可为 `own-content`（原创）、`permission`（获准）、`public-domain`（公版）。
`license` 描述扩展本身的许可，不代表小说自动获准再发布。
所有选择器使用 CSS；书名元素也支持 meta 元素的 content 属性。
bookLink/next 可省略。书籍目录链接是稳定去重键，建议站点作者提供。
来源必须是 HTTPS 标准端口；每次重定向、目录链接和下一章都重新检查来源。
不支持脚本、Cookie、自定义请求头、认证、验证码或付费绕过，拒绝本机与内网地址。
