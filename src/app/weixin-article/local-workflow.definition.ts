import {
  createWeixinArticleWorkflowDefinition,
  WeixinArticleWorkflowInput,
} from "@src/app/weixin-article/workflow.definition.ts";
import { createLocalWeixinArticleDependencies } from "@src/app/weixin-article/create-local-weixin-article-dependencies.ts";
import type { WorkflowDefinition } from "@src/core/workflow/workflow-runtime.ts";

export function createLocalWeixinArticleWorkflowDefinition(): WorkflowDefinition<
  WeixinArticleWorkflowInput
> {
  return createWeixinArticleWorkflowDefinition(
    async (config, event) =>
      await createLocalWeixinArticleDependencies(config, {
        outputDir: event.payload.dryRunOutputDir,
      }),
  );
}
