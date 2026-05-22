import { WeixinArticleWorkflow } from "@src/features/weixin-article/workflow.ts";
import { createWeixinArticleDependencies } from "@src/app/weixin-article/create-weixin-article-dependencies.ts";
import type { WeixinArticleDependencies } from "@src/features/weixin-article/dependencies.ts";
import {
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowStepContext,
} from "@src/core/workflow/workflow-runtime.ts";
import { getAppConfig } from "@src/utils/config/app-config.ts";
import type { ResolvedTrendPublishConfig } from "@src/utils/config/define-config.ts";

export interface WeixinArticleWorkflowInput {
  sourceType?: "all" | "firecrawl" | "twitter";
  maxArticles?: number;
  forcePublish?: boolean;
  dryRun?: boolean;
  dryRunOutputDir?: string;
  runId?: string;
  trigger?: "manual" | "cron";
}

export const WEIXIN_ARTICLE_WORKFLOW_ID = "weixin-article-workflow";

export type WeixinArticleDependencyFactory = (
  config: ResolvedTrendPublishConfig,
  event: WorkflowEvent<WeixinArticleWorkflowInput>,
) => Promise<WeixinArticleDependencies>;

export function createWeixinArticleWorkflowDefinition(
  dependencyFactory?: WeixinArticleDependencyFactory,
): WorkflowDefinition<WeixinArticleWorkflowInput> {
  return {
    id: WEIXIN_ARTICLE_WORKFLOW_ID,
    run: async (
      event: WorkflowEvent<WeixinArticleWorkflowInput>,
      step: WorkflowStepContext,
    ) => {
      const config = await getAppConfig();
      const dependencies = dependencyFactory
        ? await dependencyFactory(config, event)
        : await createWeixinArticleDependencies(config);
      const workflow = new WeixinArticleWorkflow({
        id: WEIXIN_ARTICLE_WORKFLOW_ID,
        name: WEIXIN_ARTICLE_WORKFLOW_ID,
      }, dependencies);
      return await workflow.run(event, step);
    },
  };
}
