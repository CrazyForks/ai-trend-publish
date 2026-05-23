import { PromptProfileName } from "@src/prompts/prompt-profile.ts";

export type ArticleTemplateType =
  | "default"
  | "minimal"
  | "modern"
  | "tech"
  | "mianpro"
  | "longform"
  | "product"
  | "darktech"
  | "dynamic"
  | "random";

export type FetchProviderName =
  | "auto"
  | "firecrawl"
  | "jina"
  | "twitter"
  | "rss";

export type ArticlePublisherProvider = "weixin" | "weixin-relay";
export type ArticleImageProvider = "dashscope" | "minimax";
export type ArticleEmbeddingProvider = "dashscope";
export type ArticleVectorStoreProvider = "sqlite" | "d1";
export type ArticleNotificationChannel = "bark" | "dingtalk" | "feishu";
export type ArticleBodyImageMode = "off" | "missing" | "all";
export type ArticleImageSize = `${number}*${number}`;
export type ConfigRuntimeTarget = "local" | "docker" | "cloudflare";

/**
 * 动态配置读取上下文。
 *
 * 用于 Docker secrets、Cloudflare bindings/secrets 等部署环境。配置结构仍然写在
 * TypeScript 中，只有具体敏感值或部署时变化的值从运行时读取。
 */
export interface ConfigRuntime {
  /** 当前运行目标。 */
  target: ConfigRuntimeTarget;
  /** 读取普通运行时值。未找到时返回 fallback，fallback 也未给时返回空字符串。 */
  value(name: string, fallback?: string): string;
  /** 读取敏感值。Docker 会优先读取 /run/secrets/<name>。 */
  secret(name: string, fallback?: string): string;
  /** 读取必填值。缺失时抛出清晰错误。 */
  required(name: string): string;
}

export type TrendPublishConfigFactory = (
  runtime: ConfigRuntime,
) => TrendPublishConfig | Promise<TrendPublishConfig>;

export type TrendPublishConfigSource =
  | TrendPublishConfig
  | TrendPublishConfigFactory;

/**
 * OpenAI Chat Completions 兼容模型接口配置。
 *
 * 默认情况下，文章排序、摘要、标题生成、动态微信 HTML 生成和 AI 配图提示词
 * 都会使用这一套聊天模型配置。只有具体功能显式声明 provider 时，才会走
 * 功能自己的 provider 选择。
 */
export interface OpenAICompatibleConfig {
  /** API 基础地址，例如 "https://api.deepseek.com/v1"。 */
  baseUrl?: string;
  /** 当前模型供应商的密钥。 */
  apiKey?: string;
  /** 当前供应商可用的聊天模型 ID。 */
  model?: string;
}

/** 内容抓取供应商凭证。只需要填写数据源实际会用到的 provider。 */
export interface FetchProvidersConfig {
  /** FireCrawl API Key。用于普通网页抓取和 web 类抓取分组。 */
  firecrawl?: {
    apiKey?: string;
  };
  /** Jina Reader / DeepSearch API Key。常用于网页抓取 fallback 或 Jina 分组。 */
  jina?: {
    apiKey?: string;
  };
  /** Twitter/X 抓取凭证。不同 adapter 会按可用字段选择使用。 */
  twitter?: {
    /** Twitter/X 官方 Bearer Token。 */
    bearerToken?: string;
    /** Xquik API Key，用作 Twitter/X 的备用抓取源。 */
    xquikApiKey?: string;
  };
  /** RSSHub 基础地址。未填写时默认使用 "https://rsshub.app"。 */
  rss?: {
    baseUrl?: string;
  };
}

/** 图片生成供应商凭证。是否启用图片功能由 features.article 决定。 */
export interface ImageProvidersConfig {
  /** 阿里云图片生成 API Key，用于封面图和正文配图生成。 */
  dashscope?: {
    apiKey?: string;
  };
  /** MiniMax 图片生成 API Key。支持 image-01 文生图。 */
  minimax?: {
    apiKey?: string;
    /** MiniMax API Host，默认 https://api.minimax.io；国内站可用 https://api.minimaxi.com。 */
    apiHost?: string;
  };
}

/** 发布供应商凭证。实际发布 provider 在 features.article.publisher 中选择。 */
export interface PublishProvidersConfig {
  /** 微信公众号发布凭证。dryRun=false 正式发布时必填。 */
  weixin?: {
    /** 微信公众号 AppID。 */
    appId?: string;
    /** 微信公众号 AppSecret。 */
    appSecret?: string;
    /** 公众号草稿/文章元信息中显示的作者名。 */
    author?: string;
    /** 是否开启文章留言。 */
    needOpenComment?: boolean;
    /** 是否仅粉丝可留言。 */
    onlyFansCanComment?: boolean;
  };
  /** 微信发布中转服务。用于 Cloudflare 等没有固定出口 IP 的部署方式。 */
  weixinRelay?: {
    /** Relay 服务地址，例如 "https://relay.example.com"。 */
    url?: string;
    /** Relay Bearer Token。 */
    token?: string;
  };
}

/** 通知供应商凭证。是否启用通知渠道由 features.article.notifications 决定。 */
export interface NotifyProvidersConfig {
  /** Bark 服务地址，例如 "https://api.day.app/<key>"。 */
  bark?: {
    url?: string;
  };
  /** 钉钉机器人 webhook 地址。 */
  dingtalk?: {
    webhook?: string;
  };
  /** 飞书 / Lark 机器人 webhook 地址。 */
  feishu?: {
    webhookUrl?: string;
  };
}

/** 向量和 embedding 供应商凭证。是否启用去重由 features.article.deduplication 决定。 */
export interface VectorProvidersConfig {
  /** OpenAI 兼容 embedding 接口，当前常用于 DashScope text-embedding-v3。 */
  embedding?: OpenAICompatibleConfig;
}

/**
 * 外部服务供应商配置。
 *
 * 这里只放凭证和 provider 默认参数。业务功能是否启用、使用哪个 provider、
 * 使用什么功能参数，都放在 features.article.* 中。
 */
export interface TrendPublishProvidersConfig {
  /** 文章排序、摘要、标题和动态模板默认使用的 LLM。 */
  ai?: OpenAICompatibleConfig;
  /** features.article.sources 和 fetchGroups 会用到的抓取 provider 凭证。 */
  fetch?: FetchProvidersConfig;
  /** 图片生成 provider 凭证。 */
  image?: ImageProvidersConfig;
  /** 发布 provider 凭证。 */
  publish?: PublishProvidersConfig;
  /** 通知 provider 凭证。 */
  notify?: NotifyProvidersConfig;
  /** Embedding / 向量 provider 凭证。 */
  vector?: VectorProvidersConfig;
}

/** 服务和 JSON-RPC API 配置。 */
export interface ServerConfig {
  /** JSON-RPC API 的 Bearer Token，也会被 doctor 检查。 */
  apiKey?: string;
  /** HTTP 服务端口，默认 8000。 */
  port?: number;
}

/** 微信文章渲染配置。 */
export interface ArticleRendererConfig {
  /**
   * 微信文章模板。
   *
   * 使用 "dynamic" 时，会让 AI 根据本次文章列表生成微信兼容的内联 HTML。
   * 使用 "random" 时，每次运行会随机选择一个静态模板。
   */
  template?: ArticleTemplateType;
  /**
   * 提示词风格。
   *
   * 会统一影响文章排序、摘要、标题、动态排版、封面提示词和正文配图提示词。
   */
  promptProfile?: PromptProfileName;
}

/** 文章发布 provider 选择。 */
export interface ArticlePublisherConfig {
  /** 文章工作流使用的发布 provider。本地固定 IP 可用 "weixin"，Cloudflare 推荐 "weixin-relay"。 */
  provider?: ArticlePublisherProvider;
}

/** 文章工作流通知配置。 */
export interface ArticleNotificationsConfig {
  /**
   * 工作流开始、失败、完成时启用的通知渠道。
   *
   * 对应渠道的 webhook / URL 仍然放在 providers.notify.* 中。留空即可关闭通知，
   * 不需要删除 provider 凭证。
   */
  channels?: ArticleNotificationChannel[];
}

/** 微信文章封面图生成配置。 */
export interface ArticleCoverConfig {
  /** 是否生成封面图。生成失败时会回退到内置兜底封面。 */
  enabled?: boolean;
  /** 封面图生成 provider。支持 "dashscope" 和 "minimax"。 */
  provider?: ArticleImageProvider;
  /** provider 模型 ID，例如 DashScope 的 "qwen-image-2.0-pro" 或 MiniMax 的 "image-01"。 */
  model?: string;
}

/** 微信文章正文配图配置。 */
export interface ArticleBodyImagesConfig {
  /**
   * 正文配图生成模式。
   *
   * - "off": 不生成正文配图。
   * - "missing": 只给没有抓取到原文图片的文章补图。
   * - "all": 每篇文章都尝试生成正文配图。
   */
  mode?: ArticleBodyImageMode;
  /** 正文配图 provider。支持 "dashscope" 和 "minimax"。 */
  provider?: ArticleImageProvider;
  /** provider 模型 ID，例如 DashScope 的 "qwen-image-2.0" 或 MiniMax 的 "image-01"。 */
  model?: string;
  /** 每篇文章最多生成几张正文配图。 */
  count?: number;
  /** 图片尺寸字符串，例如 "1024*1024"。 */
  size?: ArticleImageSize;
}

/** 抓取文章的向量去重配置。 */
export interface ArticleDeduplicationConfig {
  /** 是否计算 embedding，并过滤与历史记录相似的内容。 */
  enabled?: boolean;
  /** 去重使用的 embedding provider。当前只支持 "dashscope"。 */
  embeddingProvider?: ArticleEmbeddingProvider;
  /** 存储文章向量的后端。本地/Docker 使用 "sqlite"，Cloudflare 使用 "d1"。 */
  vectorStore?: ArticleVectorStoreProvider;
}

/** 微信文章工作流功能配置。 */
export interface ArticleFeatureConfig {
  /**
   * 文章数据源 URL 列表。
   *
   * 普通 URL 使用 fetchGroups.default。需要指定抓取策略时，可以加分组前缀，例如
   * "web:https://example.com".
   */
  sources?: string[];
  /** 渲染模板和提示词风格配置。 */
  renderer?: ArticleRendererConfig;
  /** 发布 provider 选择。 */
  publisher?: ArticlePublisherConfig;
  /** 排序和处理后保留的文章数量，默认 10。 */
  count?: number;
  /** 为 true 时只输出本地 HTML，跳过微信上传和发布。默认 true。 */
  dryRun?: boolean;
  /** 工作流通知渠道。 */
  notifications?: ArticleNotificationsConfig;
  /** 封面图生成配置。 */
  cover?: ArticleCoverConfig;
  /** 正文配图生成配置。 */
  bodyImages?: ArticleBodyImagesConfig;
  /** 向量去重配置。 */
  deduplication?: ArticleDeduplicationConfig;
}

/** 功能配置。 */
export interface FeaturesConfig {
  /** 当前主流程：微信公众号文章发布工作流。 */
  article?: ArticleFeatureConfig;
}

export interface ArtifactStorageConfig {
  /** Artifact 存储后端。本地/Docker 默认 local，Cloudflare 推荐 r2，也可用 kv 轻量部署。 */
  provider?: "local" | "kv" | "r2";
  /** local artifact 输出目录，默认 src/temp。 */
  outputDir?: string;
  /** Cloudflare R2 bucket binding 名称，默认 ARTICLE_ARTIFACTS。 */
  bucketBinding?: "ARTICLE_ARTIFACTS" | string;
}

export interface RunStateStorageConfig {
  /** 运行状态存储后端。本地默认 local-json，Cloudflare 默认 kv-d1。 */
  provider?: "memory" | "local-json" | "kv-d1";
  /** local-json 输出目录，默认 src/temp。 */
  outputDir?: string;
  /** Cloudflare KV binding 名称，默认 ARTICLE_RUNS。 */
  kvBinding?: "ARTICLE_RUNS" | string;
  /** Cloudflare D1 binding 名称，默认 ARTICLE_DB。 */
  d1Binding?: "ARTICLE_DB" | string;
}

export interface VectorStorageConfig {
  /** 向量去重存储后端。本地/Docker 默认 sqlite，Cloudflare 可用 d1。 */
  provider?: ArticleVectorStoreProvider;
  /** 本地 SQLite 数据库文件路径，默认 src/temp/trendpublish.sqlite3。 */
  sqlitePath?: string;
  /** Cloudflare D1 binding 名称，默认 ARTICLE_DB。 */
  d1Binding?: "ARTICLE_DB" | string;
}

export interface RuntimeConfigStorageConfig {
  /** 运行时配置存储后端。本地/Docker 默认 sqlite，Cloudflare 默认 d1。 */
  provider?: "sqlite" | "d1";
  /** 本地 SQLite 数据库文件路径，默认复用 src/temp/trendpublish.sqlite3。 */
  sqlitePath?: string;
  /** Cloudflare D1 binding 名称，默认 ARTICLE_DB。 */
  d1Binding?: "ARTICLE_DB" | string;
}

/** 存储配置。部署级配置仍在 TS 中，Dashboard 运行时业务配置可存入 SQLite/D1。 */
export interface StorageConfig {
  /** 工作流产物存储。 */
  artifacts?: ArtifactStorageConfig;
  /** 工作流运行状态和步骤记录存储。 */
  runState?: RunStateStorageConfig;
  /** Dashboard 可编辑的运行时业务配置。 */
  runtimeConfig?: RuntimeConfigStorageConfig;
  /** 向量去重存储。 */
  vector?: VectorStorageConfig;
}

export interface ObservabilityHttpSinkConfig {
  /** 是否启用 HTTP 观测上报。 */
  enabled?: boolean;
  /** HTTP ingest endpoint，例如 Axiom / Better Stack / 自建 OTel collector 的日志入口。 */
  endpoint?: string;
  /** Bearer token。会被日志脱敏，不会写入 artifact。 */
  bearerToken?: string;
  /** 自定义请求头，例如 { "X-Axiom-Token": "...", "X-Axiom-Dataset": "trendpublish" }。 */
  headers?: Record<string, string>;
  /** 请求体格式。Axiom 推荐 array，Better Stack / 通用 HTTP 通常用 object。 */
  format?: "object" | "array" | "ndjson";
  /** 单次上报超时时间，默认 5000ms。 */
  timeoutMs?: number;
}

export interface ObservabilityAxiomConfig {
  /** 是否启用 Axiom 上报。 */
  enabled?: boolean;
  /** Axiom dataset 名称。 */
  dataset?: string;
  /** Axiom ingest API token。 */
  token?: string;
  /** Axiom API 域名，默认 https://api.axiom.co。 */
  apiUrl?: string;
  /** 单次上报超时时间，默认 5000ms。 */
  timeoutMs?: number;
}

export interface ObservabilityBetterStackConfig {
  /** 是否启用 Better Stack Logs 上报。 */
  enabled?: boolean;
  /** Better Stack source token。 */
  sourceToken?: string;
  /** Ingesting host，默认 https://in.logs.betterstack.com。 */
  ingestingHost?: string;
  /** 单次上报超时时间，默认 5000ms。 */
  timeoutMs?: number;
}

export interface ObservabilityConfig {
  /** 是否启用 logger 观测镜像。默认 true。 */
  enabled?: boolean;
  /** 服务名，默认 trendpublish。 */
  serviceName?: string;
  /** 环境名，默认 local。 */
  environment?: string;
  /** stdout 镜像输出。原 logger 仍会正常输出；开启后会额外输出结构化日志。 */
  stdout?: {
    enabled?: boolean;
    /** json 适合平台采集，pretty 适合本地肉眼查看。 */
    format?: "json" | "pretty";
  };
  /** 通用 HTTP 上报。Axiom / Better Stack / 自建 collector 都可通过这里接入。 */
  http?: ObservabilityHttpSinkConfig;
  /** Axiom 便捷配置。 */
  axiom?: ObservabilityAxiomConfig;
  /** Better Stack Logs 便捷配置。 */
  betterStack?: ObservabilityBetterStackConfig;
}

/**
 * TrendPublish 用户配置。
 *
 * 组织规则：
 * - providers: 外部服务凭证和 provider 默认参数。
 * - fetchGroups: 数据源抓取路由和 fallback 策略。
 * - features.article: 微信文章工作流要启用什么能力、选择哪个 provider、使用什么参数。
 * - storage: 向量去重记录等业务数据存储。
 */
export interface TrendPublishConfig {
  /** 服务和 JSON-RPC API 配置。 */
  server?: ServerConfig;
  /** 外部服务凭证和 provider 默认参数。 */
  providers?: TrendPublishProvidersConfig;
  /**
   * 数据源抓取路由分组。sources 可使用 groupName:url 前缀。
   * "auto" 会按 URL 自动推断 twitter / rss / firecrawl。
   */
  fetchGroups?: Record<string, FetchProviderName[]>;
  /** 功能开关和功能级 provider 选择。 */
  features?: FeaturesConfig;
  /** 业务数据存储。 */
  storage?: StorageConfig;
  /** 结构化日志和外部观测平台配置。 */
  observability?: ObservabilityConfig;
}

export interface ResolvedTrendPublishConfig {
  server: {
    apiKey: string;
    port: number;
  };
  providers: {
    ai: Required<OpenAICompatibleConfig>;
    fetch: {
      firecrawl: {
        apiKey: string;
      };
      jina: {
        apiKey: string;
      };
      twitter: {
        bearerToken: string;
        xquikApiKey: string;
      };
      rss: {
        baseUrl: string;
      };
    };
    image: {
      dashscope: {
        apiKey: string;
      };
      minimax: {
        apiKey: string;
        apiHost: string;
      };
    };
    publish: {
      weixin: {
        appId: string;
        appSecret: string;
        author: string;
        needOpenComment: boolean;
        onlyFansCanComment: boolean;
      };
      weixinRelay: {
        url: string;
        token: string;
      };
    };
    notify: {
      bark: {
        url: string;
      };
      dingtalk: {
        webhook: string;
      };
      feishu: {
        webhookUrl: string;
      };
    };
    vector: {
      embedding: Required<OpenAICompatibleConfig>;
    };
  };
  fetchGroups: Record<string, FetchProviderName[]>;
  features: {
    article: {
      sources: string[];
      renderer: {
        template: ArticleTemplateType;
        promptProfile: PromptProfileName;
      };
      publisher: {
        provider: ArticlePublisherProvider;
      };
      count: number;
      dryRun: boolean;
      notifications: {
        channels: ArticleNotificationChannel[];
      };
      cover: {
        enabled: boolean;
        provider: ArticleImageProvider;
        model: string;
      };
      bodyImages: {
        mode: ArticleBodyImageMode;
        provider: ArticleImageProvider;
        model: string;
        count: number;
        size: ArticleImageSize;
      };
      deduplication: {
        enabled: boolean;
        embeddingProvider: ArticleEmbeddingProvider;
        vectorStore: ArticleVectorStoreProvider;
      };
    };
  };
  storage: {
    artifacts: {
      provider: "local" | "kv" | "r2";
      outputDir: string;
      bucketBinding: string;
    };
    runState: {
      provider: "memory" | "local-json" | "kv-d1";
      outputDir: string;
      kvBinding: string;
      d1Binding: string;
    };
    runtimeConfig: {
      provider: "sqlite" | "d1";
      sqlitePath: string;
      d1Binding: string;
    };
    vector: {
      provider: ArticleVectorStoreProvider;
      sqlitePath: string;
      d1Binding: string;
    };
  };
  observability: {
    enabled: boolean;
    serviceName: string;
    environment: string;
    stdout: {
      enabled: boolean;
      format: "json" | "pretty";
    };
    http: {
      enabled: boolean;
      endpoint: string;
      bearerToken: string;
      headers: Record<string, string>;
      format: "object" | "array" | "ndjson";
      timeoutMs: number;
    };
    axiom: {
      enabled: boolean;
      dataset: string;
      token: string;
      apiUrl: string;
      timeoutMs: number;
    };
    betterStack: {
      enabled: boolean;
      sourceToken: string;
      ingestingHost: string;
      timeoutMs: number;
    };
  };
}

export function defineConfig<T extends TrendPublishConfigSource>(
  config: T,
): T {
  return config;
}

export function resolveTrendPublishConfig(
  config: TrendPublishConfig,
): ResolvedTrendPublishConfig {
  const article = config.features?.article ?? {};
  const articleRenderer = article.renderer ?? {};
  const articlePublisher = article.publisher ?? {};
  const coverProvider = article.cover?.provider ?? "dashscope";
  const bodyImageProvider = article.bodyImages?.provider ?? "dashscope";

  return {
    server: {
      apiKey: config.server?.apiKey ?? "",
      port: config.server?.port ?? 8000,
    },
    providers: {
      ai: {
        baseUrl: config.providers?.ai?.baseUrl ?? "",
        apiKey: config.providers?.ai?.apiKey ?? "",
        model: config.providers?.ai?.model ?? "",
      },
      fetch: {
        firecrawl: {
          apiKey: config.providers?.fetch?.firecrawl?.apiKey ?? "",
        },
        jina: {
          apiKey: config.providers?.fetch?.jina?.apiKey ?? "",
        },
        twitter: {
          bearerToken: config.providers?.fetch?.twitter?.bearerToken ?? "",
          xquikApiKey: config.providers?.fetch?.twitter?.xquikApiKey ?? "",
        },
        rss: {
          baseUrl: config.providers?.fetch?.rss?.baseUrl ?? "",
        },
      },
      image: {
        dashscope: {
          apiKey: config.providers?.image?.dashscope?.apiKey ?? "",
        },
        minimax: {
          apiKey: config.providers?.image?.minimax?.apiKey ?? "",
          apiHost: config.providers?.image?.minimax?.apiHost ??
            "https://api.minimax.io",
        },
      },
      publish: {
        weixin: {
          appId: config.providers?.publish?.weixin?.appId ?? "",
          appSecret: config.providers?.publish?.weixin?.appSecret ?? "",
          author: config.providers?.publish?.weixin?.author ??
            "AI Trend Publish",
          needOpenComment: config.providers?.publish?.weixin?.needOpenComment ??
            true,
          onlyFansCanComment:
            config.providers?.publish?.weixin?.onlyFansCanComment ?? false,
        },
        weixinRelay: {
          url: config.providers?.publish?.weixinRelay?.url ?? "",
          token: config.providers?.publish?.weixinRelay?.token ?? "",
        },
      },
      notify: {
        bark: {
          url: config.providers?.notify?.bark?.url ?? "",
        },
        dingtalk: {
          webhook: config.providers?.notify?.dingtalk?.webhook ?? "",
        },
        feishu: {
          webhookUrl: config.providers?.notify?.feishu?.webhookUrl ?? "",
        },
      },
      vector: {
        embedding: {
          baseUrl: config.providers?.vector?.embedding?.baseUrl ?? "",
          apiKey: config.providers?.vector?.embedding?.apiKey ?? "",
          model: config.providers?.vector?.embedding?.model ?? "",
        },
      },
    },
    fetchGroups: config.fetchGroups ?? {
      default: ["auto"],
    },
    features: {
      article: {
        sources: article.sources ?? [],
        renderer: {
          template: articleRenderer.template ?? "minimal",
          promptProfile: articleRenderer.promptProfile ?? "technology",
        },
        publisher: {
          provider: articlePublisher.provider ?? "weixin",
        },
        count: article.count ?? 10,
        dryRun: article.dryRun ?? true,
        notifications: {
          channels: article.notifications?.channels ?? [],
        },
        cover: {
          enabled: article.cover?.enabled ?? true,
          provider: coverProvider,
          model: resolveArticleImageModel(
            coverProvider,
            "cover",
            article.cover?.model,
          ),
        },
        bodyImages: {
          mode: article.bodyImages?.mode ?? "off",
          provider: bodyImageProvider,
          model: resolveArticleImageModel(
            bodyImageProvider,
            "body",
            article.bodyImages?.model,
          ),
          count: article.bodyImages?.count ?? 1,
          size: article.bodyImages?.size ?? "1024*1024",
        },
        deduplication: {
          enabled: article.deduplication?.enabled ?? false,
          embeddingProvider: article.deduplication?.embeddingProvider ??
            "dashscope",
          vectorStore: article.deduplication?.vectorStore ?? "sqlite",
        },
      },
    },
    storage: {
      artifacts: {
        provider: config.storage?.artifacts?.provider ?? "local",
        outputDir: config.storage?.artifacts?.outputDir ?? "src/temp",
        bucketBinding: config.storage?.artifacts?.bucketBinding ??
          "ARTICLE_ARTIFACTS",
      },
      runState: {
        provider: config.storage?.runState?.provider ?? "local-json",
        outputDir: config.storage?.runState?.outputDir ?? "src/temp",
        kvBinding: config.storage?.runState?.kvBinding ?? "ARTICLE_RUNS",
        d1Binding: config.storage?.runState?.d1Binding ?? "ARTICLE_DB",
      },
      runtimeConfig: {
        provider: config.storage?.runtimeConfig?.provider ?? "sqlite",
        sqlitePath: config.storage?.runtimeConfig?.sqlitePath ??
          "src/temp/trendpublish.sqlite3",
        d1Binding: config.storage?.runtimeConfig?.d1Binding ?? "ARTICLE_DB",
      },
      vector: {
        provider: config.storage?.vector?.provider ??
          article.deduplication?.vectorStore ?? "sqlite",
        sqlitePath: config.storage?.vector?.sqlitePath ??
          "src/temp/trendpublish.sqlite3",
        d1Binding: config.storage?.vector?.d1Binding ?? "ARTICLE_DB",
      },
    },
    observability: {
      enabled: config.observability?.enabled ?? true,
      serviceName: config.observability?.serviceName ?? "trendpublish",
      environment: config.observability?.environment ?? "local",
      stdout: {
        enabled: config.observability?.stdout?.enabled ?? false,
        format: config.observability?.stdout?.format ?? "json",
      },
      http: {
        enabled: config.observability?.http?.enabled ?? false,
        endpoint: config.observability?.http?.endpoint ?? "",
        bearerToken: config.observability?.http?.bearerToken ?? "",
        headers: config.observability?.http?.headers ?? {},
        format: config.observability?.http?.format ?? "object",
        timeoutMs: config.observability?.http?.timeoutMs ?? 5000,
      },
      axiom: {
        enabled: config.observability?.axiom?.enabled ?? false,
        dataset: config.observability?.axiom?.dataset ?? "",
        token: config.observability?.axiom?.token ?? "",
        apiUrl: config.observability?.axiom?.apiUrl ?? "https://api.axiom.co",
        timeoutMs: config.observability?.axiom?.timeoutMs ?? 5000,
      },
      betterStack: {
        enabled: config.observability?.betterStack?.enabled ?? false,
        sourceToken: config.observability?.betterStack?.sourceToken ?? "",
        ingestingHost: config.observability?.betterStack?.ingestingHost ??
          "https://in.logs.betterstack.com",
        timeoutMs: config.observability?.betterStack?.timeoutMs ?? 5000,
      },
    },
  };
}

function resolveArticleImageModel(
  provider: ArticleImageProvider,
  usage: "cover" | "body",
  configuredModel?: string,
): string {
  if (
    configuredModel && isCompatibleArticleImageModel(provider, configuredModel)
  ) {
    return configuredModel;
  }
  return defaultArticleImageModel(provider, usage);
}

function defaultArticleImageModel(
  provider: ArticleImageProvider,
  usage: "cover" | "body",
): string {
  switch (provider) {
    case "dashscope":
      return usage === "cover" ? "qwen-image-2.0-pro" : "qwen-image-2.0";
    case "minimax":
      return "image-01";
  }
}

function isCompatibleArticleImageModel(
  provider: ArticleImageProvider,
  model: string,
): boolean {
  switch (provider) {
    case "dashscope":
      return !model.startsWith("image-");
    case "minimax":
      return !model.startsWith("qwen-") && !model.startsWith("wanx-");
  }
}
