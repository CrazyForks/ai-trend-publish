import { ContentRanker } from "@src/modules/content-rank/ai.content-ranker.ts";
import { INotifier } from "@src/core/ports/notifier.ts";
import { ContentPublisher } from "@src/core/ports/content-publisher.ts";
import { WeixinArticleContentDedupService } from "@src/features/weixin-article/services/content-dedup.service.ts";
import { WeixinArticleContentProcessService } from "@src/features/weixin-article/services/content-process.service.ts";
import { WeixinArticleContentScrapeService } from "@src/features/weixin-article/services/content-scrape.service.ts";
import { WeixinArticleCoverService } from "@src/features/weixin-article/services/article-cover.service.ts";
import { WeixinArticleDryRunOutputService } from "@src/features/weixin-article/services/dry-run-output.service.ts";
import { WeixinArticleRenderService } from "@src/features/weixin-article/services/article-render.service.ts";
import { WeixinArticleTitleService } from "@src/features/weixin-article/services/article-title.service.ts";
import { WeixinArticleWorkflowStats } from "@src/features/weixin-article/services/workflow-stats.ts";
import type { WeixinArticleWorkflowConfig } from "@src/features/weixin-article/workflow.ts";

export interface WeixinArticlePublisher extends ContentPublisher {
  validateIpWhitelist(): Promise<string | boolean>;
}

export interface WeixinArticleDependencies {
  publisher: WeixinArticlePublisher;
  notifier: INotifier;
  scrapeService: WeixinArticleContentScrapeService;
  dedupService: WeixinArticleContentDedupService;
  processService: WeixinArticleContentProcessService;
  titleService: WeixinArticleTitleService;
  coverService: WeixinArticleCoverService;
  renderService: WeixinArticleRenderService;
  dryRunOutputService: WeixinArticleDryRunOutputService;
  contentRanker: ContentRanker;
  stats: WeixinArticleWorkflowStats;
  config: WeixinArticleWorkflowConfig;
}
