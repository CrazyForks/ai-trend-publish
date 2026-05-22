import { WorkflowType } from "./cron.ts";
import { LocalWorkflowRuntime } from "@src/core/workflow/local-workflow-runtime.ts";
import { createLocalWeixinArticleWorkflowDefinition } from "@src/app/weixin-article/local-workflow.definition.ts";

export async function triggerWorkflow(params: Record<string, any>) {
  const { workflowType = WorkflowType.WeixinArticle, ...payload } = params;

  if (workflowType !== WorkflowType.WeixinArticle) {
    throw new Error(
      `无效的工作流类型。当前仅支持: ${WorkflowType.WeixinArticle}`,
    );
  }

  const runtime = new LocalWorkflowRuntime();
  const runId = payload.runId ?? `manual-${crypto.randomUUID()}`;
  await runtime.run(createLocalWeixinArticleWorkflowDefinition(), {
    payload: {
      ...payload,
      runId,
      trigger: "manual",
    },
    id: runId,
    timestamp: Date.now(),
  });

  return {
    success: true,
    runId,
    message: "微信文章工作流已成功触发",
  };
}
