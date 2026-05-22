import {
  ArticleNotificationChannel,
  ArticleTemplateType,
  defineConfig,
} from "@src/utils/config/define-config.ts";
import { PromptProfileName } from "./src/prompts/prompt-profile.ts";

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function booleanValue(value: string, fallback: boolean): boolean {
  if (!value) return fallback;
  return value === "true" || value === "1";
}

export default defineConfig((runtime) => {
  const notificationChannels = splitList(
    runtime.value("NOTIFICATION_CHANNELS", ""),
  ) as ArticleNotificationChannel[];
  const firecrawlApiKey = runtime.secret("FIRECRAWL_API_KEY");
  const jinaApiKey = runtime.secret("JINA_API_KEY");
  const webFetchProviders = [
    firecrawlApiKey ? "firecrawl" : "",
    jinaApiKey ? "jina" : "",
  ].filter(Boolean) as Array<"firecrawl" | "jina">;

  return {
    server: {
      apiKey: runtime.required("SERVER_API_KEY"),
      port: 8000,
    },

    providers: {
      ai: {
        baseUrl: runtime.value("AI_BASE_URL", "https://api.deepseek.com/v1"),
        apiKey: runtime.required("AI_API_KEY"),
        model: runtime.value("AI_MODEL", "deepseek-chat"),
      },
      fetch: {
        firecrawl: {
          apiKey: firecrawlApiKey,
        },
        jina: {
          apiKey: jinaApiKey,
        },
        twitter: {
          bearerToken: runtime.secret("TWITTER_BEARER_TOKEN"),
          xquikApiKey: runtime.secret("XQUIK_API_KEY"),
        },
        rss: {
          baseUrl: runtime.value("RSSHUB_BASE_URL", "https://rsshub.app"),
        },
      },
      image: {
        dashscope: {
          apiKey: runtime.secret("DASHSCOPE_API_KEY"),
        },
      },
      publish: {
        weixin: {
          appId: runtime.secret("WEIXIN_APP_ID"),
          appSecret: runtime.secret("WEIXIN_APP_SECRET"),
          author: runtime.value("WEIXIN_AUTHOR", "AI Trend Publish"),
          needOpenComment: booleanValue(
            runtime.value("WEIXIN_NEED_OPEN_COMMENT", ""),
            true,
          ),
          onlyFansCanComment: booleanValue(
            runtime.value("WEIXIN_ONLY_FANS_CAN_COMMENT", ""),
            false,
          ),
        },
        weixinRelay: {
          url: runtime.secret("WEIXIN_RELAY_URL"),
          token: runtime.secret("WEIXIN_RELAY_TOKEN"),
        },
      },
      notify: {
        bark: {
          url: runtime.secret("BARK_URL"),
        },
        dingtalk: {
          webhook: runtime.secret("DINGTALK_WEBHOOK"),
        },
        feishu: {
          webhookUrl: runtime.secret("FEISHU_WEBHOOK_URL"),
        },
      },
    },

    fetchGroups: {
      default: ["auto"],
      web: webFetchProviders.length ? webFetchProviders : ["firecrawl"],
      reliableWeb: webFetchProviders.length ? webFetchProviders : ["firecrawl"],
      social: ["twitter"],
    },

    features: {
      article: {
        sources: splitList(
          runtime.value("ARTICLE_SOURCES", "https://news.ycombinator.com/"),
        ),
        publisher: {
          provider: runtime.value(
            "WEIXIN_PUBLISH_PROVIDER",
            "weixin-relay",
          ) as "weixin" | "weixin-relay",
        },
        renderer: {
          template: runtime.value(
            "ARTICLE_RENDERER_TEMPLATE",
            "dynamic",
          ) as ArticleTemplateType,
          promptProfile: runtime.value(
            "ARTICLE_PROMPT_PROFILE",
            "technology",
          ) as PromptProfileName,
        },
        count: Number(runtime.value("ARTICLE_COUNT", "10")),
        dryRun: false,
        notifications: {
          channels: notificationChannels,
        },
        cover: {
          enabled: booleanValue(runtime.value("COVER_ENABLED", ""), true),
          provider: "dashscope",
          model: runtime.value(
            "COVER_MODEL",
            "wanx-poster-generation-v1",
          ),
        },
        bodyImages: {
          mode: runtime.value("BODY_IMAGES_MODE", "off") as
            | "off"
            | "missing"
            | "all",
          provider: "dashscope",
          count: Number(runtime.value("BODY_IMAGES_COUNT", "1")),
          size: runtime.value(
            "BODY_IMAGES_SIZE",
            "1024*1024",
          ) as `${number}*${number}`,
        },
        deduplication: {
          enabled: false,
          embeddingProvider: "dashscope",
          vectorStore: "d1",
        },
      },
    },

    storage: {
      artifacts: {
        provider: "kv",
        bucketBinding: "ARTICLE_RUNS",
      },
      runState: {
        provider: "kv-d1",
        kvBinding: "ARTICLE_RUNS",
        d1Binding: "ARTICLE_DB",
      },
      vector: {
        provider: "d1",
        d1Binding: "ARTICLE_DB",
      },
    },
  };
});
