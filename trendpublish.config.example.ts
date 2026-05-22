import { defineConfig } from "@src/utils/config/define-config.ts";

export default defineConfig({
  /**
   * 服务配置。
   *
   * `apiKey` 用于 JSON-RPC 接口鉴权：
   * Authorization: Bearer <apiKey>
   */
  server: {
    apiKey: "change-me",
    port: 8000,
  },

  /**
   * 外部服务凭证。
   *
   * 这里只放凭证和 provider 默认参数。功能是否启用、使用哪个 provider、
   * 使用什么参数，都放在 `features.article` 里。
   */
  providers: {
    /**
     * 全文章链路默认使用的 LLM。
     *
     * 排序、摘要、标题生成、动态模板和 AI 提示词都会使用这组配置。
     * 这里支持任意 OpenAI Chat Completions 兼容接口。
     */
    ai: {
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "",
      model: "deepseek-chat",
    },

    /**
     * 内容抓取 provider 凭证。
     *
     * 只需要填写 `fetchGroups` 会用到，或 `auto` 会推断到的 provider。
     * 例如 Twitter/X URL 需要 twitter provider；普通网页默认通常需要
     * FireCrawl，除非你把它路由到 Jina。
     */
    fetch: {
      firecrawl: {
        apiKey: "",
      },
      twitter: {
        bearerToken: "",
        xquikApiKey: "",
      },
      jina: {
        apiKey: "",
      },
      rss: {
        baseUrl: "https://rsshub.app",
      },
    },

    /**
     * 图片生成凭证。
     *
     * DashScope / 阿里云百炼用于生成封面图和可选的正文 AI 配图。
     */
    image: {
      dashscope: {
        apiKey: "",
      },
    },

    /**
     * 发布凭证。
     *
     * 只有 `features.article.dryRun` 为 false，也就是真正发布到公众号时才必填。
     */
    publish: {
      weixin: {
        appId: "",
        appSecret: "",
        author: "AI Trend Publish",
        needOpenComment: true,
        onlyFansCanComment: false,
      },
      /**
       * Cloudflare Worker 没有固定出口 IP。真实发布建议让 Cloudflare 调用
       * 固定 IP 机器上的 weixin-relay，由 relay 保存微信 appId/appSecret。
       */
      weixinRelay: {
        url: "",
        token: "",
      },
    },

    /**
     * 通知凭证。
     *
     * 在这里填写 webhook 不会自动开启通知。是否开启通知由
     * `features.article.notifications.channels` 决定。
     */
    notify: {
      bark: {
        url: "",
      },
      dingtalk: {
        webhook: "",
      },
      feishu: {
        webhookUrl: "",
      },
    },

    /**
     * 文章去重使用的 embedding 凭证。
     *
     * 是否启用去重由 `features.article.deduplication.enabled` 决定。
     */
    vector: {
      embedding: {
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: "",
        model: "text-embedding-v3",
      },
    },
  },

  /**
   * 抓取路由分组。
   *
   * `sources` 里的数据源可以是普通 URL，也可以带分组前缀：
   * - "https://example.com" 使用 `default` 分组
   * - "web:https://example.com" 使用 `web` 分组
   *
   * 分组里的 provider 会按顺序 fallback。谁先返回内容，就使用谁的结果。
   * `auto` 会按 URL 自动推断 provider：
   * - x.com / twitter.com -> twitter
   * - RSS / RSSHub / feed URL -> rss
   * - 其他网页 -> firecrawl
   */
  fetchGroups: {
    default: ["auto"],
    web: ["firecrawl", "jina"],
    social: ["twitter"],
    reliableWeb: ["firecrawl", "jina"],
  },

  /**
   * 功能配置。
   *
   * 当前项目主流程聚焦微信公众号文章发布。
   */
  features: {
    article: {
      /**
       * 文章数据源列表。
       *
       * 新手可以先只写普通 URL。只有某个数据源需要指定抓取策略时，
       * 再添加 `group:url` 前缀。
       */
      sources: [
        "https://news.ycombinator.com/",
        "web:https://example.com/ai-news",
        "social:https://x.com/OpenAIDevs",
        "reliableWeb:https://openai.com/news/",
      ],

      /**
       * 发布 provider 选择。
       *
       * - 本地/Docker 固定 IP 直连微信：`weixin`
       * - Cloudflare 等无固定出口 IP 环境：`weixin-relay`
       */
      publisher: {
        provider: "weixin",
      },

      /**
       * 微信文章渲染配置。
       *
       * `template` 控制视觉模板。使用 `dynamic` 时，AI 会根据本次文章列表
       * 实时生成微信兼容的内联 HTML。
       *
       * `promptProfile` 控制内容口径，会统一影响排序、摘要、标题、动态排版、
       * 封面提示词和正文配图提示词。
       */
      renderer: {
        template: "dynamic",
        promptProfile: "technology",
      },

      /**
       * 每次发布保留多少篇排序后的文章。
       */
      count: 10,

      /**
       * 安全本地模式。
       *
       * true: 只生成 HTML artifact，不上传图片、不发布到公众号。
       * 本地/Docker 会写入 `src/temp`，Cloudflare 会写入 R2。
       * false: 上传图片并发布 / 创建微信公众号草稿。
       */
      dryRun: true,

      /**
       * 工作流通知。
       *
       * 留空表示关闭通知。需要开启时，在 channels 中加入渠道名，并配置
       * 对应 `providers.notify.*` 凭证：
       * ["bark"]、["dingtalk"]、["feishu"]，也可以组合多个渠道。
       */
      notifications: {
        channels: [],
      },

      /**
       * 封面图生成。
       *
       * 如果 DashScope 未配置或生成失败，流程会回退到内置默认封面。
       */
      cover: {
        enabled: true,
        provider: "dashscope",
        model: "wanx-poster-generation-v1",
      },

      /**
       * 正文 AI 配图。
       *
       * mode:
       * - "off": 不生成正文配图。
       * - "missing": 只给没有抓取到原文图片的文章补图。
       * - "all": 每篇文章都尝试生成正文配图。
       */
      bodyImages: {
        mode: "off",
        provider: "dashscope",
        count: 1,
        size: "1024*1024",
      },

      /**
       * 文章向量去重。
       *
       * 开启后会计算文章 embedding，并和历史向量做相似度对比。
       * 本地/Docker 默认使用 SQLite，Cloudflare 原生模式使用 D1。
       * SQLite 会自动执行内置建表 SQL；Cloudflare D1 使用 migrations 目录。
       */
      deduplication: {
        enabled: false,
        embeddingProvider: "dashscope",
        vectorStore: "sqlite",
      },
    },
  },

  /**
   * 业务数据和运行产物存储。
   *
   * 运行配置不会存到数据库。artifact/runState 支撑内置看板和 dry-run 产物。
   */
  storage: {
    artifacts: {
      provider: "local",
      outputDir: "src/temp",
    },
    runState: {
      provider: "local-json",
      outputDir: "src/temp",
    },
    vector: {
      provider: "sqlite",
      sqlitePath: "src/temp/trendpublish.sqlite3",
    },
  },
});
