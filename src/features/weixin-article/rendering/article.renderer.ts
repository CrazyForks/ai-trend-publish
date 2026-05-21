import {
  ArticleImageLayoutService,
  NoopArticleImageLayoutService,
  WeixinTemplate,
} from "@src/features/weixin-article/domain/renderable-article.ts";
import ejs from "npm:ejs";
import { BaseTemplateRenderer } from "@src/features/weixin-article/rendering/base.renderer.ts";
import { Logger } from "@zilla/logger";
import type { ContentImageUploader } from "@src/core/ports/content-publisher.ts";

const DYNAMIC_TEMPLATE = "__dynamic__";
const logger = new Logger("weixin-article-template-renderer");

export interface DynamicHtmlGenerator {
  generate(articles: WeixinTemplate[]): Promise<string>;
}

/**
 * 文章模板渲染器
 */
export class WeixinArticleTemplateRenderer
  extends BaseTemplateRenderer<WeixinTemplate[]> {
  constructor(
    private dynamicHtmlGenerator?: DynamicHtmlGenerator,
    private uploadContentImages: boolean = true,
    private imageLayoutService: ArticleImageLayoutService =
      new NoopArticleImageLayoutService(),
    private imageUploader?: ContentImageUploader,
    defaultTemplateType?: string,
  ) {
    super("article", defaultTemplateType);
    this.availableTemplates = [
      "default",
      "modern",
      "tech",
      "mianpro",
      "longform",
      "product",
      "minimal",
      "darktech",
      "dynamic",
    ];
  }

  public setUploadContentImages(enabled: boolean): void {
    this.uploadContentImages = enabled;
  }

  /**
   * 加载文章模板文件
   */
  protected async loadTemplates(): Promise<void> {
    this.templates = {
      default: await this.getTemplateContent(
        "/templates/article.ejs",
      ),
      modern: await this.getTemplateContent(
        "/templates/article.modern.ejs",
      ),
      tech: await this.getTemplateContent(
        "/templates/article.tech.ejs",
      ),
      mianpro: await this.getTemplateContent(
        "/templates/article.mianpro.ejs",
      ),
      longform: await this.getTemplateContent(
        "/templates/article.longform.ejs",
      ),
      product: await this.getTemplateContent(
        "/templates/article.product.ejs",
      ),
      minimal: await this.getTemplateContent(
        "/templates/article.minimal.ejs",
      ),
      darktech: await this.getTemplateContent(
        "/templates/article.darktech.ejs",
      ),
      dynamic: DYNAMIC_TEMPLATE,
    };
  }

  /**
   * 实现doRender方法，添加预处理步骤
   */
  public async doRender(
    data: WeixinTemplate[],
    template: string,
  ): Promise<string> {
    console.log(
      `WeixinArticleTemplateRenderer doRender: ${data.length} articles`,
    );
    const processedData = await this.imageLayoutService.layoutArticles(data);

    await this.processArticleImages(processedData);

    if (template === DYNAMIC_TEMPLATE) {
      try {
        if (!this.dynamicHtmlGenerator) {
          throw new Error("动态微信模板需要注入 DynamicHtmlGenerator");
        }
        return await this.dynamicHtmlGenerator.generate(processedData);
      } catch (error) {
        logger.warn(
          `动态微信模板生成失败，回退 minimal: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return this.renderStaticTemplate(processedData, this.templates.minimal);
      }
    }

    return this.renderStaticTemplate(processedData, template);
  }

  private renderStaticTemplate(
    articles: WeixinTemplate[],
    template: string,
  ): string {
    return ejs.render(
      template,
      {
        articles,
      },
      { rmWhitespace: true },
    );
  }

  private async processArticleImages(
    articles: WeixinTemplate[],
  ): Promise<void> {
    if (!articles.some((article) => /<img\b/i.test(article.content))) {
      return;
    }
    if (!this.uploadContentImages) {
      logger.info("[DryRun] 跳过微信正文图片上传");
      return;
    }

    if (!this.imageUploader) {
      throw new Error("正文图片上传需要注入 ContentImageUploader");
    }

    const { WeixinImageProcessor } = await import(
      "@src/utils/image/image-processor.ts"
    );
    const imageProcessor = new WeixinImageProcessor(this.imageUploader);

    // 将图片上传到微信 并替换图片url
    for (const article of articles) {
      const { content, results } = await imageProcessor.processContent(
        article.content,
      );
      article.content = content;
      console.log(results);
    }
  }
}
