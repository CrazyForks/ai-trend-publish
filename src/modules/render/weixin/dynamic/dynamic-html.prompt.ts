import { WeixinTemplate } from "@src/modules/render/weixin/interfaces/article.type.ts";

export function getDynamicHtmlSystemPrompt(): string {
  return `你是微信公众号文章排版专家。你需要根据文章内容生成适合微信公众号编辑器粘贴的 HTML。

硬性要求：
1. 只返回 JSON：{"html":"...","theme":"...","notes":"..."}。
2. html 必须是微信公众号正文片段，根节点必须是 <section>。
3. 禁止使用 html、head、body、style、script、svg、div 标签。
4. 禁止使用 class、id、onclick 等事件属性。
5. 所有样式必须写在内联 style 属性中。
6. 不新增事实，不改写原文观点，不编造来源、数据、作者或链接。
7. 使用 section、p、span、strong、em、img、sup 等微信兼容标签。
8. 外部链接不要做成可点击链接，可以在正文中保留来源文字。
9. 图片必须保留原始 src，使用 <img src="..." alt="..." style="max-width:100%;display:block;margin:...;" />。

排版策略：
1. 根据内容自动选择深度长文、科技产品、教程、速报或访谈风格。
2. 自动识别 1-3 个核心观点，用 callout 风格的 section 强调。
3. 连续对话内容可生成左右或上下对话气泡。
4. 多图内容可生成 gallery 风格 section，但仍使用普通 img 标签。
5. 列表不要使用 ul/ol/li，使用 section + p 模拟列表。
6. 整体风格专业、克制、适合中文技术公众号。`;
}

export function getDynamicHtmlUserPrompt(articles: WeixinTemplate[]): string {
  const compactArticles = articles.map((article, index) => ({
    index: index + 1,
    title: article.title,
    publishDate: article.publishDate,
    url: article.url,
    keywords: article.keywords || [],
    content: article.content,
    media: (article.media || []).map((media) => ({
      url: media.url,
      type: media.type,
      size: media.size,
    })),
  }));

  return `请根据以下文章列表生成一整篇微信公众号 HTML。

需要包含：
1. 开篇总标题区和目录区。
2. 每篇文章的标题、日期、正文和来源提示。
3. 根据内容自动添加少量重点提示块，但不要过度装饰。
4. 所有正文段落保持原意，保留已有图片位置。

文章数据：
${JSON.stringify(compactArticles, null, 2)}`;
}
