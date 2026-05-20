import { ScrapedContent } from "@src/modules/interfaces/scraper.interface.ts";
import { WeixinArticleTemplateRenderer } from "@src/modules/render/weixin/article.renderer.ts";
import { WeixinTemplate } from "@src/modules/render/weixin/interfaces/article.type.ts";

export class WeixinArticleRenderService {
  constructor(private renderer: WeixinArticleTemplateRenderer) {}

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
      keywords: content.metadata.keywords,
      media: content.media,
    }));
  }

  public render(templateData: WeixinTemplate[]): Promise<string> {
    return this.renderer.render(templateData);
  }
}
