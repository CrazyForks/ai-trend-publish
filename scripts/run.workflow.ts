import { WorkflowType } from "@src/controllers/cron.ts";
import { LocalWorkflowRuntime } from "@src/core/workflow/local-workflow-runtime.ts";
import { createWeixinArticleWorkflowDefinition } from "@src/app/weixin-article/workflow.definition.ts";
import {
  initializeAppConfig,
  shutdownAppResources,
  validateAppConfig,
} from "@src/utils/config/app-config.ts";

interface CliOptions {
  dryRun: boolean;
  maxArticles?: number;
  sourceType?: "all" | "firecrawl" | "twitter";
  dryRunOutputDir?: string;
  forcePublish?: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const next = args[index + 1];

    switch (arg) {
      case "--workflow":
        if (!next || next !== WorkflowType.WeixinArticle) {
          throw new Error(
            `--workflow 仅支持: ${WorkflowType.WeixinArticle}`,
          );
        }
        index++;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--dry-run-output":
        if (!next) {
          throw new Error("--dry-run-output 需要提供输出目录");
        }
        options.dryRunOutputDir = next;
        index++;
        break;
      case "--max-articles":
        if (!next || Number.isNaN(Number(next))) {
          throw new Error("--max-articles 需要提供数字");
        }
        options.maxArticles = Number(next);
        index++;
        break;
      case "--source":
        if (
          next !== "all" && next !== "firecrawl" && next !== "twitter"
        ) {
          throw new Error("--source 必须是 all、firecrawl 或 twitter");
        }
        options.sourceType = next;
        index++;
        break;
      case "--force-publish":
        options.forcePublish = true;
        break;
      case "--help":
        printHelp();
        Deno.exit(0);
        break;
      default:
        throw new Error(`未知参数: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`TrendPublish 工作流运行器

用法:
  deno task article
  deno task article:dry
  deno run -A scripts/run.workflow.ts --workflow weixin-article-workflow --dry-run --max-articles 5

参数:
  --workflow <type>       兼容旧命令，仅支持 weixin-article-workflow
  --dry-run              跑完整流程但不上传封面/正文图，也不发布
  --dry-run-output <dir> dry-run HTML 输出目录
  --max-articles <n>     限制文章数量
  --source <type>        all、firecrawl 或 twitter
  --force-publish        传递强制发布标记
`);
}

const options = parseArgs(Deno.args);
try {
  await initializeAppConfig();
  await validateAppConfig({
    requireLLM: true,
    requireWeixinPublish: !options.dryRun,
  });

  const runtime = new LocalWorkflowRuntime();
  await runtime.run(createWeixinArticleWorkflowDefinition(), {
    payload: {
      dryRun: options.dryRun,
      dryRunOutputDir: options.dryRunOutputDir,
      maxArticles: options.maxArticles,
      sourceType: options.sourceType,
      forcePublish: options.forcePublish,
    },
    id: options.dryRun ? "manual-dry-run" : "manual-run",
    timestamp: Date.now(),
  });
} finally {
  await shutdownAppResources();
}
