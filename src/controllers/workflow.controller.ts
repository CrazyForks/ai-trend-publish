import { WorkflowType } from "./cron.ts";
import { LocalWorkflowRuntime } from "@src/core/workflow/local-workflow-runtime.ts";
import { createWeixinArticleWorkflowDefinition } from "@src/app/weixin-article/workflow.definition.ts";

export async function triggerWorkflow(params: Record<string, any>) {
  const { workflowType = WorkflowType.WeixinArticle, ...payload } = params;

  if (workflowType !== WorkflowType.WeixinArticle) {
    throw new Error(
      `无效的工作流类型。当前仅支持: ${WorkflowType.WeixinArticle}`,
    );
  }

  const runtime = new LocalWorkflowRuntime();
  await runtime.run(createWeixinArticleWorkflowDefinition(), {
    payload,
    id: "local-step-execution",
    timestamp: Date.now(),
  });

  return {
    success: true,
    message: "微信文章工作流已成功触发",
  };
}
