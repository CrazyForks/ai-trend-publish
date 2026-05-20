import { ScrapedContent } from "@src/modules/interfaces/scraper.interface.ts";
import { EmbeddingFactory } from "@src/providers/embedding/embedding-factory.ts";
import {
  EmbeddingProvider,
  EmbeddingProviderType,
} from "@src/providers/interfaces/embedding.interface.ts";
import type { VectorService } from "@src/services/vector-service.ts";
import { VectorSimilarityUtil } from "@src/utils/VectorSimilarityUtil.ts";
import { ConfigManager } from "@src/utils/config/config-manager.ts";
import { Logger } from "@zilla/logger";
import ProgressBar from "jsr:@deno-library/progress";
import { WeixinArticleWorkflowStats } from "./workflow-stats.ts";

const logger = new Logger("weixin-article-dedup-service");

export class WeixinArticleContentDedupService {
  private embeddingModel!: EmbeddingProvider;
  private existingVectors: { vector: number[]; content: string | null }[] = [];
  private vectorService?: VectorService;

  constructor(
    private readonly stats: WeixinArticleWorkflowStats,
  ) {}

  async deduplicate(contents: ScrapedContent[]): Promise<ScrapedContent[]> {
    const enableDeduplication = await ConfigManager.getInstance().get(
      "ENABLE_DEDUPLICATION",
    );

    if (!enableDeduplication) {
      return contents;
    }

    this.embeddingModel = await EmbeddingFactory.getInstance().getProvider({
      providerType: EmbeddingProviderType.DASHSCOPE,
      model: "text-embedding-v3",
    });

    const vectorService = await this.getVectorService();
    const existingVectors = await vectorService.getByType("article");
    this.existingVectors = existingVectors.map((v) => ({
      vector: v.vector,
      content: v.content,
    }));

    const contentEmbeddings = new Map<string, number[]>();
    const newVectors: {
      content: string;
      vector: number[];
      vectorDim: number;
      vectorType: string;
    }[] = [];

    logger.info("[向量计算] 开始批量计算内容向量");
    const embedProgress = new ProgressBar({
      title: "向量计算进度",
      total: contents.length,
      clear: true,
      display: ":title | :percent | :completed/:total | :time \n",
    });
    let embedCompleted = 0;

    await Promise.all(
      contents.map(async (content) => {
        try {
          const embedding = await this.embeddingModel.createEmbedding(
            content.content,
          );
          contentEmbeddings.set(content.id, embedding.embedding);
          newVectors.push({
            content: content.content,
            vector: embedding.embedding,
            vectorDim: embedding.embedding.length,
            vectorType: "article",
          });
        } catch (error) {
          logger.error(
            `[向量计算] 计算内容 ${content.id} 的向量失败:`,
            error,
          );
        }
        await embedProgress.render(++embedCompleted);
      }),
    );

    logger.info(`[向量计算] 完成 ${contentEmbeddings.size} 个内容的向量计算`);

    const deduplicatedContents: ScrapedContent[] = [];
    for (const content of contents) {
      const contentVector = contentEmbeddings.get(content.id);
      if (!contentVector) continue;

      const isDuplicate = this.checkDuplicateWithVector(content, contentVector);
      if (!isDuplicate) {
        deduplicatedContents.push(content);
      }
    }

    if (newVectors.length > 0) {
      logger.info(`[向量存储] 开始批量保存 ${newVectors.length} 个新向量`);
      await vectorService.createBatch(newVectors);
      logger.info("[向量存储] 向量保存完成");
    }

    logger.info(
      `[去重] 完成内容去重，原始内容 ${contents.length} 篇，去重后 ${deduplicatedContents.length} 篇，重复 ${this.stats.duplicates} 篇`,
    );

    return deduplicatedContents;
  }

  private async getVectorService(): Promise<VectorService> {
    if (!this.vectorService) {
      const { VectorService } = await import("@src/services/vector-service.ts");
      this.vectorService = new VectorService();
    }
    return this.vectorService;
  }

  private checkDuplicateWithVector(
    content: ScrapedContent,
    contentVector: number[],
  ): boolean {
    try {
      for (const existingVector of this.existingVectors) {
        if (!existingVector.vector || !contentVector) {
          continue;
        }
        const similarity = VectorSimilarityUtil.cosineSimilarity(
          contentVector,
          existingVector.vector,
        );
        if (similarity >= 0.85) {
          logger.info(
            `[去重] 发现重复内容: ${content.id}, 相似度: ${similarity}, 原内容: ${
              existingVector.content?.slice(0, 50)
            }...`,
          );
          this.stats.duplicates++;
          return true;
        }
      }
      return false;
    } catch (error) {
      logger.error(`[去重] 检查重复失败: ${error}`);
      return false;
    }
  }
}
