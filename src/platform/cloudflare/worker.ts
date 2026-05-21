import {
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowStepContext,
  WorkflowStepOptions,
} from "@src/core/workflow/workflow-runtime.ts";
import {
  createWeixinArticleWorkflowDefinition,
  WEIXIN_ARTICLE_WORKFLOW_ID,
  WeixinArticleWorkflowInput,
} from "@src/app/weixin-article/workflow.definition.ts";

interface CloudflareWorkflowStep {
  do<T>(
    name: string,
    optionsOrFn: WorkflowStepOptions | (() => Promise<T>),
    fn?: () => Promise<T>,
  ): Promise<T>;
  sleep?(name: string, duration: string | number): Promise<void>;
}

interface WorkflowBinding<TInput> {
  create(options?: { id?: string; params?: TInput }): Promise<unknown>;
}

interface CloudflareEnv {
  WEIXIN_ARTICLE_WORKFLOW: WorkflowBinding<WeixinArticleWorkflowInput>;
}

function toStepContext(step: CloudflareWorkflowStep): WorkflowStepContext {
  return {
    do: (name, optionsOrFn, fn) => step.do(name, optionsOrFn, fn),
    sleep: async (name, duration) => {
      if (!step.sleep) {
        throw new Error("Cloudflare Workflow step.sleep is unavailable");
      }
      await step.sleep(name, duration);
    },
  };
}

export class WeixinArticleCloudflareWorkflow {
  private readonly definition: WorkflowDefinition<WeixinArticleWorkflowInput> =
    createWeixinArticleWorkflowDefinition();

  async run(
    event: WorkflowEvent<WeixinArticleWorkflowInput>,
    step: CloudflareWorkflowStep,
  ): Promise<void> {
    await this.definition.run(event, toStepContext(step));
  }
}

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/api/workflow") {
      return new Response("Not Found", { status: 404 });
    }

    const payload = await request.json().catch(
      () => ({}),
    ) as WeixinArticleWorkflowInput;
    await env.WEIXIN_ARTICLE_WORKFLOW.create({
      id: `${WEIXIN_ARTICLE_WORKFLOW_ID}-${Date.now()}`,
      params: payload,
    });
    return Response.json({ success: true });
  },

  async scheduled(
    _event: unknown,
    env: CloudflareEnv,
  ): Promise<void> {
    await env.WEIXIN_ARTICLE_WORKFLOW.create({
      id: `${WEIXIN_ARTICLE_WORKFLOW_ID}-cron-${Date.now()}`,
      params: {},
    });
  },
};
