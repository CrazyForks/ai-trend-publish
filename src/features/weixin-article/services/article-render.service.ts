import { ScrapedContent } from "@src/core/ports/content-scraper.ts";
import { WeixinTemplate } from "@src/features/weixin-article/domain/renderable-article.ts";

export interface WeixinArticleRenderer {
  setUploadContentImages(enabled: boolean): void;
  render(templateData: WeixinTemplate[]): Promise<string>;
}

export class WeixinArticleRenderService {
  constructor(private renderer: WeixinArticleRenderer) {}

  public setUploadContentImages(enabled: boolean): void {
    this.renderer.setUploadContentImages(enabled);
  }

  public toTemplateData(contents: ScrapedContent[]): WeixinTemplate[] {
    return contents.map((content) => ({
      id: content.id,
      title: content.title,
      content: content.content,
      url: content.url,
      publishDate: content.publishDate,
      metadata: content.metadata,
      keywords: Array.isArray(content.metadata.keywords)
        ? content.metadata.keywords
        : [],
      media: content.media,
    }));
  }

  public render(templateData: WeixinTemplate[]): Promise<string> {
    return this.renderer.render(templateData);
  }
}
