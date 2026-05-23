import { ContentPublisher } from "@src/core/ports/content-publisher.ts";
import {
  ImageGenerator,
  ImageGeneratorType,
} from "@src/core/ports/image-generator.ts";
import { Logger } from "@zilla/logger";
import { getCoverTitle } from "./article-title.service.ts";
import {
  PromptProfileName,
  resolvePromptProfile,
} from "@src/prompts/prompt-profile.ts";
import { redactError } from "@src/utils/security/redact.ts";

const logger = new Logger("weixin-article-cover-service");

export interface ArticleCoverImageGeneratorResolver {
  getGenerator(
    type: ImageGeneratorType.ALIYUN_POSTER | ImageGeneratorType.MINIMAX_IMAGE,
  ): Promise<ImageGenerator<ArticleCoverImageRequest, string>>;
}

interface ArticleCoverImageRequest {
  model?: string;
  title: string;
  sub_title?: string;
  prompt_text_zh?: string;
  generate_mode: "generate";
  generate_num: 1;
}

export interface CoverGenerationResult {
  mediaId: string;
  generated: boolean;
  fallback: boolean;
  generatorType: string;
  model?: string;
  imageUrl?: string;
  error?: string;
}

export class WeixinArticleCoverService {
  constructor(
    private publisher: Pick<ContentPublisher, "uploadImage">,
    private imageGeneratorResolver: ArticleCoverImageGeneratorResolver,
    private readonly promptProfile?: PromptProfileName,
    private readonly imageModel?: string,
    private readonly imageGeneratorType:
      | ImageGeneratorType.ALIYUN_POSTER
      | ImageGeneratorType.MINIMAX_IMAGE = ImageGeneratorType.ALIYUN_POSTER,
  ) {}

  public async generateCoverMediaId(title: string): Promise<string> {
    return (await this.generateCover(title)).mediaId;
  }

  public async generateCover(title: string): Promise<CoverGenerationResult> {
    try {
      return await this.generateAndUploadCover(title);
    } catch (error) {
      const redacted = redactError(error);
      logger.warn(
        `[封面生成] 动态封面生成失败，使用默认封面继续发布: ${redacted.message}`,
      );
      return {
        mediaId: await this.publisher.uploadImage(""),
        generated: false,
        fallback: true,
        generatorType: this.imageGeneratorType,
        model: this.imageModel,
        error: redacted.message,
      };
    }
  }

  private async generateAndUploadCover(
    title: string,
  ): Promise<CoverGenerationResult> {
    const imageGenerator = await this.imageGeneratorResolver
      .getGenerator(this.imageGeneratorType);
    const coverTitle = getCoverTitle(title);
    const profile = resolvePromptProfile(this.promptProfile);
    const imageUrl = await imageGenerator.generate({
      model: this.imageModel,
      title: coverTitle,
      sub_title: `${new Date().toLocaleDateString()} ${profile.label}`,
      prompt_text_zh: [
        "中文公众号封面图",
        `主题：${profile.coverGuidance}`,
        `标题语义：${coverTitle}`,
        `目标读者：${profile.audience}`,
        `视觉风格：${profile.editorialTone}`,
        `画面元素：${profile.imageGuidance}`,
        "限制：不要出现二维码、水印、品牌 Logo、可识别人脸；不要生成除标题外的多余小字",
      ].join(" | "),
      generate_mode: "generate",
      generate_num: 1,
    });

    return {
      mediaId: await this.publisher.uploadImage(imageUrl),
      generated: true,
      fallback: false,
      generatorType: this.imageGeneratorType,
      model: this.imageModel,
      imageUrl,
    };
  }
}
