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

export type ArticlePublisherProvider = "weixin";
export type ArticleImageProvider = "dashscope";
export type ArticleEmbeddingProvider = "dashscope";
export type ArticleVectorStoreProvider = "mysql";
export type ArticleNotificationChannel = "bark" | "dingtalk" | "feishu";
export type ArticleBodyImageMode = "off" | "missing" | "all";
export type ArticleImageSize = `${number}*${number}`;

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
  /** DashScope / 阿里云百炼 API Key，用于封面图和正文配图生成。 */
  dashscope?: {
    apiKey?: string;
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
  /** 文章工作流使用的发布 provider。当前只支持 "weixin"。 */
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
  /** 封面图生成 provider。当前只支持 "dashscope"。 */
  provider?: ArticleImageProvider;
  /** provider 模型 ID，例如 "wanx-poster-generation-v1"。 */
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
  /** 正文配图 provider。当前只支持 "dashscope"。 */
  provider?: ArticleImageProvider;
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
  /** 存储文章向量的后端。当前只支持 "mysql"。 */
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

/** MySQL 业务数据存储配置，例如向量去重记录。 */
export interface MysqlStorageConfig {
  /** 是否启用数据库存储。 */
  enabled?: boolean;
  /** MySQL 主机地址。 */
  host?: string;
  /** MySQL 端口，默认 3306。 */
  port?: number;
  /** MySQL 用户名。 */
  user?: string;
  /** MySQL 密码。 */
  password?: string;
  /** 数据库名称。 */
  database?: string;
}

/** 存储配置。运行配置不会存入数据库。 */
export interface StorageConfig {
  /** 用于保存向量去重记录等业务数据的 MySQL 存储。 */
  mysql?: MysqlStorageConfig;
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
    };
    publish: {
      weixin: {
        appId: string;
        appSecret: string;
        author: string;
        needOpenComment: boolean;
        onlyFansCanComment: boolean;
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
    mysql: {
      enabled: boolean;
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
    };
  };
}

export function defineConfig(config: TrendPublishConfig): TrendPublishConfig {
  return config;
}

export function resolveTrendPublishConfig(
  config: TrendPublishConfig,
): ResolvedTrendPublishConfig {
  const article = config.features?.article ?? {};
  const articleRenderer = article.renderer ?? {};
  const articlePublisher = article.publisher ?? {};

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
          provider: article.cover?.provider ?? "dashscope",
          model: article.cover?.model ?? "wanx-poster-generation-v1",
        },
        bodyImages: {
          mode: article.bodyImages?.mode ?? "off",
          provider: article.bodyImages?.provider ?? "dashscope",
          count: article.bodyImages?.count ?? 1,
          size: article.bodyImages?.size ?? "1024*1024",
        },
        deduplication: {
          enabled: article.deduplication?.enabled ?? false,
          embeddingProvider: article.deduplication?.embeddingProvider ??
            "dashscope",
          vectorStore: article.deduplication?.vectorStore ?? "mysql",
        },
      },
    },
    storage: {
      mysql: {
        enabled: config.storage?.mysql?.enabled ?? false,
        host: config.storage?.mysql?.host ?? "127.0.0.1",
        port: config.storage?.mysql?.port ?? 3306,
        user: config.storage?.mysql?.user ?? "root",
        password: config.storage?.mysql?.password ?? "",
        database: config.storage?.mysql?.database ?? "ai_trend_publish",
      },
    },
  };
}
