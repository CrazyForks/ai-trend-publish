import { WeixinPublisher } from "@src/modules/publishers/weixin.publisher.ts";
import { ImageGeneratorFactory } from "@src/providers/image-gen/image-generator-factory.ts";
import { ImageGeneratorType } from "@src/providers/interfaces/image-gen.interface.ts";
import { Logger } from "@zilla/logger";
import { getCoverTitle } from "./article-title.service.ts";

const logger = new Logger("weixin-article-cover-service");

export class WeixinArticleCoverService {
  constructor(
    private publisher: WeixinPublisher,
    private imageGeneratorFactory = ImageGeneratorFactory.getInstance(),
  ) {}

  public async generateCoverMediaId(title: string): Promise<string> {
    try {
      return await this.generateAndUploadCover(title);
    } catch (error) {
      logger.warn(
        `[封面生成] 动态封面生成失败，使用默认封面继续发布: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return await this.publisher.uploadImage("");
    }
  }

  private async generateAndUploadCover(title: string): Promise<string> {
    const imageGenerator = await this.imageGeneratorFactory
      .getGenerator(ImageGeneratorType.ALIWANX_POSTER);
    const coverTitle = getCoverTitle(title);
    const imageUrl = await imageGenerator.generate({
      title: coverTitle,
      sub_title: new Date().toLocaleDateString() + " AI速递",
      prompt_text_zh:
        `科技前沿资讯 | 人工智能新闻 | 每日AI快报 - ${coverTitle}`,
      generate_mode: "generate",
      generate_num: 1,
    });

    return await this.publisher.uploadImage(imageUrl);
  }
}
