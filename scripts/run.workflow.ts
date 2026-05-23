import { WorkflowType } from "@src/controllers/cron.ts";
import { LocalWorkflowRuntime } from "@src/core/workflow/local-workflow-runtime.ts";
import { createLocalWeixinArticleWorkflowDefinition } from "@src/app/weixin-article/local-workflow.definition.ts";
import {
  initializeAppConfig,
  parseConfigArgs,
  shutdownAppResources,
  validateAppConfig,
} from "@src/utils/config/app-config.ts";

interface CliOptions {
  dryRun: boolean;
  maxArticles?: number;
  sourceType?: "all" | "firecrawl" | "twitter";
  dryRunOutputDir?: string;
  forcePublish?: boolean;
  profileId?: string;
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
      case "--profile":
        if (!next) {
          throw new Error("--profile 需要提供 Profile ID");
        }
        options.profileId = next;
        index++;
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
  deno task article --dry-run
  deno run -A scripts/run.workflow.ts --workflow weixin-article-workflow --dry-run --max-articles 5

参数:
  --config <path>       指定配置文件路径，优先级高于 TRENDPUBLISH_CONFIG
  --workflow <type>       兼容旧命令，仅支持 weixin-article-workflow
  --dry-run              跑完整流程但不上传封面/正文图，也不发布
  --dry-run-output <dir> dry-run HTML 输出目录
  --max-articles <n>     限制文章数量
  --source <type>        all、firecrawl 或 twitter
  --profile <id>        指定 Dashboard 运行时配置 Profile
  --force-publish        传递强制发布标记
`);
}

const parsedConfigArgs = parseConfigArgs(Deno.args);
const options = parseArgs(parsedConfigArgs.args);
try {
  await initializeAppConfig({ configPath: parsedConfigArgs.configPath });
  await validateAppConfig({
    requireLLM: true,
    requireWeixinPublish: !options.dryRun,
  });

  const runtime = new LocalWorkflowRuntime();
  const runId = options.dryRun
    ? `manual-dry-run-${crypto.randomUUID()}`
    : `manual-run-${crypto.randomUUID()}`;
  await runtime.run(createLocalWeixinArticleWorkflowDefinition(), {
    payload: {
      runId,
      trigger: "manual",
      dryRun: options.dryRun,
      dryRunOutputDir: options.dryRunOutputDir,
      maxArticles: options.maxArticles,
      sourceType: options.sourceType,
      forcePublish: options.forcePublish,
      profileId: options.profileId,
    },
    id: runId,
    timestamp: Date.now(),
  });
} finally {
  await shutdownAppResources();
}
