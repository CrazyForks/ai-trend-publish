import { ScrapedContent } from "@src/core/ports/content-scraper.ts";
import type { ArticlePlan } from "@src/features/weixin-article/domain/article-plan.ts";
import { WeixinTemplate } from "@src/features/weixin-article/domain/renderable-article.ts";

export interface WeixinArticleRenderContext {
  articlePlan?: ArticlePlan;
}

export interface WeixinArticleRenderer {
  setUploadContentImages(enabled: boolean): void;
  setGenerateContentImages?(enabled: boolean): void;
  render(
    templateData: WeixinTemplate[],
    context?: WeixinArticleRenderContext,
  ): Promise<string>;
}

export class WeixinArticleRenderService {
  constructor(private renderer: WeixinArticleRenderer) {}

  public setUploadContentImages(enabled: boolean): void {
    this.renderer.setUploadContentImages(enabled);
  }

  public setGenerateContentImages(enabled: boolean): void {
    this.renderer.setGenerateContentImages?.(enabled);
  }

  public toTemplateData(
    contents: ScrapedContent[],
    articlePlan?: ArticlePlan,
  ): WeixinTemplate[] {
    return this.orderByArticlePlan(contents, articlePlan).map((content) => ({
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

  private orderByArticlePlan(
    contents: ScrapedContent[],
    articlePlan?: ArticlePlan,
  ): ScrapedContent[] {
    const plannedIds = articlePlan?.sections
      .flatMap((section) => section.articleIds)
      .filter((id, index, ids) => id && ids.indexOf(id) === index) ?? [];
    if (!plannedIds.length) return contents;

    const byId = new Map(contents.map((content) => [content.id, content]));
    const plannedContents = plannedIds
      .map((id) => byId.get(id))
      .filter((content): content is ScrapedContent => Boolean(content));

    return plannedContents.length ? plannedContents : contents;
  }

  public render(
    templateData: WeixinTemplate[],
    context?: WeixinArticleRenderContext,
  ): Promise<string> {
    return this.renderer.render(templateData, context);
  }
}
