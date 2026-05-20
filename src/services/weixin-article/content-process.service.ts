import { RankResult } from "@src/modules/interfaces/content-ranker.interface.ts";
import { ScrapedContent } from "@src/modules/interfaces/scraper.interface.ts";
import { ContentSummarizer } from "@src/modules/interfaces/summarizer.interface.ts";
import { BarkNotifier } from "@src/modules/notify/bark.notify.ts";
import { ConfigManager } from "@src/utils/config/config-manager.ts";
import { Logger } from "@zilla/logger";
import ProgressBar from "jsr:@deno-library/progress";

const logger = new Logger("weixin-article-process-service");

export class WeixinArticleContentProcessService {
  constructor(
    private readonly summarizer: ContentSummarizer,
    private readonly notifier: BarkNotifier,
  ) {}

  async processTopRanked(
    rankedContents: RankResult[],
    sourceContents: ScrapedContent[],
    maxArticles?: number,
  ): Promise<ScrapedContent[]> {
    const limit = maxArticles ||
      await ConfigManager.getInstance().get("ARTICLE_NUM") || 10;

    const topContents = this.pickTopContents(
      rankedContents,
      sourceContents,
      limit,
    );

    if (topContents.length < limit) {
      logger.warn(
        `[内容处理] 文章数量不足，期望 ${limit} 篇，实际 ${topContents.length} 篇`,
      );
      await this.notifier.warning(
        "内容数量不足",
        `仅获取到 ${topContents.length} 篇文章，少于预期的 ${limit} 篇`,
      );
    }

    logger.debug(
      "[内容处理] 开始处理文章",
      JSON.stringify(topContents, null, 2),
    );

    const processProgress = new ProgressBar({
      title: "内容处理进度",
      total: topContents.length,
      clear: true,
      display: ":title | :percent | :completed/:total | :time \n",
    });
    let processCompleted = 0;

    await Promise.all(topContents.map(async (content) => {
      await this.processContent(content);
      await processProgress.render(++processCompleted, {
        title: `已处理: ${content.title?.slice(0, 5) || "无标题"}...`,
      });
    }));

    return topContents;
  }

  private pickTopContents(
    rankedContents: RankResult[],
    sourceContents: ScrapedContent[],
    maxArticles: number,
  ): ScrapedContent[] {
    const topContents: ScrapedContent[] = [];

    for (const ranked of rankedContents.slice(0, maxArticles)) {
      const content = sourceContents.find((item) => item.id === ranked.id);
      if (content) {
        content.metadata.score = ranked.score;
        content.metadata.wordCount = content.content.length;
        content.metadata.readTime = Math.ceil(content.metadata.wordCount / 275);
        topContents.push(content);
      }
    }

    return topContents;
  }

  private async processContent(content: ScrapedContent): Promise<void> {
    try {
      const summary = await this.summarizer.summarize(JSON.stringify(content));
      content.title = summary.title;
      content.content = summary.content;
      content.metadata.keywords = summary.keywords;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[内容处理] ${content.id} 处理失败:`, message);
      await this.notifier.warning(
        "内容处理失败",
        `ID: ${content.id}\n保留原始内容`,
      );
      content.title = content.title || "无标题";
      content.content = content.content || "内容处理失败";
      content.metadata.keywords = content.metadata.keywords || [];
    }
  }
}
