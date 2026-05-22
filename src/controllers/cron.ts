import cron from "npm:node-cron";
import { Logger } from "@zilla/logger";
import { LocalWorkflowRuntime } from "@src/core/workflow/local-workflow-runtime.ts";
import {
  createLocalWeixinArticleWorkflowDefinition,
} from "@src/app/weixin-article/local-workflow.definition.ts";
import { getAppConfig } from "@src/utils/config/app-config.ts";
import { createArticleNotifier } from "@src/app/weixin-article/notifications.ts";
const logger = new Logger("cron");
export enum WorkflowType {
  WeixinArticle = "weixin-article-workflow",
}

export function getWorkflow(type: WorkflowType) {
  if (type !== WorkflowType.WeixinArticle) {
    throw new Error(`未知的工作流类型: ${type}`);
  }
  return createLocalWeixinArticleWorkflowDefinition();
}

export const startCronJobs = async () => {
  const config = await getAppConfig();
  const notifier = createArticleNotifier(config);
  notifier.notify("定时任务启动", "定时任务启动");
  logger.info("初始化定时任务...");

  // 每天凌晨3点执行
  cron.schedule(
    "0 3 * * *",
    async () => {
      try {
        logger.info("开始执行微信文章工作流...");
        const runtime = new LocalWorkflowRuntime();
        const runId = `cron-${crypto.randomUUID()}`;
        await runtime.run(createLocalWeixinArticleWorkflowDefinition(), {
          payload: {
            runId,
            trigger: "cron",
          },
          id: runId,
          timestamp: Date.now(),
        });
      } catch (error) {
        logger.error(`工作流执行失败:`, error);
        notifier.notify("工作流执行失败", String(error));
      }
    },
    {
      timezone: "Asia/Shanghai",
    },
  );
};
