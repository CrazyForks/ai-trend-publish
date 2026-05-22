# 配置说明

本项目推荐使用 `trendpublish.config.ts` 作为主要配置来源。它有 TypeScript
类型提示，适合集中组织模型、抓取源、微信发布、图片和通知配置。

```bash
cp trendpublish.config.example.ts trendpublish.config.ts
deno task doctor
```

运行配置只从 `trendpublish.config.ts`
读取。数据库只保存运行历史、步骤明细、发布结果和向量去重记录，不再保存运行配置。
`doctor` 会按功能块检查缺失项，并把 `your_api_key`、`change-me`
这类占位值视为未配置。

## 配置文件路径

默认读取当前目录的 `trendpublish.config.ts`。需要切换配置文件时，可以显式指定：

```bash
deno task doctor --config ./config/trendpublish.config.ts
deno task article:dry --config ./config/trendpublish.config.ts
deno task dev --config ./config/trendpublish.config.ts
```

也可以设置 `TRENDPUBLISH_CONFIG` 指向配置文件。Docker 镜像默认读取
`/app/config/trendpublish.config.ts`。

## 运行时配置函数

配置仍然是 TypeScript 结构。如果部署环境里的密钥或地址需要动态注入，可以把
`defineConfig` 写成函数：

```ts
import { defineConfig } from "@src/utils/config/define-config.ts";

export default defineConfig((runtime) => ({
  server: {
    apiKey: runtime.required("SERVER_API_KEY"),
  },
  providers: {
    ai: {
      baseUrl: runtime.value("AI_BASE_URL", "https://api.deepseek.com/v1"),
      apiKey: runtime.required("AI_API_KEY"),
      model: runtime.value("AI_MODEL", "deepseek-chat"),
    },
  },
  features: {
    article: {
      dryRun: true,
      sources: ["https://news.ycombinator.com/"],
    },
  },
}));
```

这样只有“哪些值从运行时来”是显式的，不会出现通用覆盖规则导致配置来源混乱。

## 最小配置

如果只是启动服务、预览模板、跑 AI 摘要和动态模板，先填这一组：

```ts
import { defineConfig } from "@src/utils/config/define-config.ts";

export default defineConfig({
  server: { apiKey: "your-api-key" },
  providers: {
    ai: {
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "your_api_key",
      model: "deepseek-chat",
    },
  },
  features: {
    article: {
      renderer: { template: "minimal" },
      dryRun: true,
    },
  },
});
```

如果要在固定 IP 的本地服务器或 Docker 里直连微信公众号，还必须填：

```ts
providers: {
  publish: {
    weixin: {
      appId: "your_app_id",
      appSecret: "your_app_secret",
    },
  },
}
```

如果是 Cloudflare Worker / Workflows 这类没有固定出口 IP 的环境，推荐发布到 固定
IP 机器上的 `weixin-relay`，Cloudflare 配置里只放 relay 地址和 token：

```ts
providers: {
  publish: {
    weixinRelay: {
      url: "https://relay.example.com",
      token: "your_relay_token",
    },
  },
},
features: {
  article: {
    publisher: { provider: "weixin-relay" },
    dryRun: false,
  },
},
```

## 功能开关与必需配置

| 想开启的功能            | TS 配置位置                                                                                 | 说明                                               |
| ----------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 启动 JSON-RPC 服务      | `server.apiKey`                                                                             | API 请求需带 `Authorization: Bearer <key>`         |
| AI 摘要、排序、动态模板 | `providers.ai.*`                                                                            | 使用 OpenAI Chat Completions 兼容接口              |
| 本地模板预览            | `features.article.renderer.template`                                                        | 静态模板不依赖公众号配置                           |
| 提示词风格              | `features.article.renderer.promptProfile`                                                   | 控制排序、摘要、标题、动态排版和配图口径           |
| 微信文章 dry-run        | `features.article.dryRun: true`                                                             | 不发布，本地输出 HTML，Cloudflare 输出 R2 artifact |
| 微信公众号正式发布      | `features.article.publisher`, `providers.publish.weixin` 或 `providers.publish.weixinRelay` | 本地固定 IP 可直连微信；Cloudflare 推荐 relay      |
| 文章数据源              | `features.article.sources`                                                                  | URL 列表，可用抓取分组前缀                         |
| 抓取供应商              | `providers.fetch.*`                                                                         | FireCrawl、Twitter/X、Xquik、Jina、RSS             |
| 阿里云封面生图          | `features.article.cover`, `providers.image.dashscope.apiKey`                                | 未配置或失败时使用兜底封面                         |
| 正文 AI 智能配图        | `features.article.bodyImages`, `providers.image.dashscope.apiKey`                           | 按文章内容生成正文配图，失败时回退已有图片         |
| 文章向量去重            | `features.article.deduplication`, `providers.vector.embedding.*`, `storage.vector.*`        | 本地/Docker 用 SQLite，Cloudflare 用 D1            |
| 运行看板和产物          | `storage.artifacts`, `storage.runState`                                                     | 本地写文件，Cloudflare 使用 R2/KV/D1               |
| Bark 通知               | `features.article.notifications.channels`, `providers.notify.bark`                          | channels 中包含 `bark` 时检查 Bark URL             |
| 钉钉通知                | `features.article.notifications.channels`, `providers.notify.dingtalk`                      | channels 中包含 `dingtalk` 时检查 webhook          |
| 飞书通知                | `features.article.notifications.channels`, `providers.notify.feishu`                        | channels 中包含 `feishu` 时检查 webhook            |

## 运行产物与看板存储

本地/Docker 默认配置无需手动填写：

```ts
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
```

Cloudflare Workflow 原生模式使用 bindings：

```ts
storage: {
  artifacts: {
    provider: "r2",
    bucketBinding: "ARTICLE_ARTIFACTS",
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
```

`/dashboard` 会读取同一套 run state 和 artifact，因此本地和 Cloudflare
都能查看步骤、错误、耗时和 HTML 产物。

## 推荐配置路径

### 1. 只看模板效果

```ts
server: { apiKey: "your-api-key" },
providers: {
  ai: {
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "your_api_key",
    model: "deepseek-chat",
  },
},
features: {
  article: {
    renderer: { template: "minimal" },
    dryRun: true,
  },
},
```

运行：

```bash
deno task preview
```

### 2. 跑一次微信文章 dry-run

在最小配置基础上，配置抓取供应商和 URL 列表：

```ts
providers: {
  fetch: {
    firecrawl: { apiKey: "your_firecrawl_key" },
    twitter: { xquikApiKey: "your_xquik_key" },
    jina: { apiKey: "your_jina_key" },
  },
},
fetchGroups: {
  default: ["auto"],
  web: ["firecrawl", "jina"],
  social: ["twitter"],
},
features: {
  article: {
    dryRun: true,
    renderer: {
      template: "dynamic",
      promptProfile: "technology",
    },
    sources: [
      "https://news.ycombinator.com/",
      "web:https://openai.com/news/",
      "social:https://x.com/OpenAIDevs",
    ],
  },
},
```

无前缀 URL 使用 `fetchGroups.default`；`web:`、`social:` 是自定义抓取分组名。
分组内 provider 按顺序 fallback，成功一个就停止。`auto` 会按 URL 推断：
Twitter/X 域名走 Twitter，RSS/RSSHub 走 RSS，其余网页走 FireCrawl。

运行：

```bash
deno task article:dry
```

### 3. 正式发布公众号

在 dry-run 跑通后，再配置：

```ts
providers: {
  publish: {
    weixin: {
      appId: "your_app_id",
      appSecret: "your_app_secret",
    },
  },
},
features: { article: { dryRun: false } },
```

运行：

```bash
deno task article
```

### 4. 开启封面生图

```ts
providers: {
  image: { dashscope: { apiKey: "your_dashscope_key" } },
},
features: {
  article: {
    cover: { enabled: true, provider: "dashscope" },
  },
},
```

封面生成失败不会中断主流程，会回退默认封面。

### 5. 开启正文 AI 智能配图

```ts
providers: {
  image: { dashscope: { apiKey: "your_dashscope_key" } },
},
features: {
  article: {
    bodyImages: {
      mode: "missing",
      provider: "dashscope",
      count: 1,
      size: "1024*1024",
    },
  },
},
```

默认只在文章没有抓取到原文 `media` 图片时生成正文配图。生成失败不会中断发布，
会回退到已有 media 图片布局。

### 6. 开启文章去重

```ts
providers: {
  vector: {
    embedding: {
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "your_dashscope_key",
      model: "text-embedding-v3",
    },
  },
},
features: {
  article: {
    deduplication: {
      enabled: true,
      embeddingProvider: "dashscope",
      vectorStore: "sqlite",
    },
  },
},
storage: {
  vector: {
    provider: "sqlite",
    sqlitePath: "src/temp/trendpublish.sqlite3",
  },
},
```

SQLite 也需要建表，但你不需要手工执行。Local/Docker 首次使用 `SQLiteVectorStore`
时会自动执行内置建表 SQL。Cloudflare D1 使用
`migrations/0001_article_workflow_state.sql`，通过 `deno task cf:migrate:remote`
应用到远端，或通过 `deno task cf:migrate:local` 应用到本地 Wrangler dev 数据库。

### 7. 开启工作流通知

```ts
providers: {
  notify: {
    bark: { url: "https://api.day.app/your_key" },
    dingtalk: { webhook: "https://oapi.dingtalk.com/robot/send?access_token=..." },
    feishu: { webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/..." },
  },
},
features: {
  article: {
    notifications: {
      channels: ["bark"],
    },
  },
},
```

通知是否启用只看 `features.article.notifications.channels`；`providers.notify.*`
只保存对应渠道的凭证。

## 模型配置

默认情况下，全项目只使用一套模型配置，内容排序、摘要、标题生成和动态模板都会走这组配置。

常见兼容 OpenAI Chat Completions 的供应商示例：

- OpenAI: `baseUrl: "https://api.openai.com/v1"`，`model: "gpt-4o-mini"`
- DeepSeek: `baseUrl: "https://api.deepseek.com/v1"`，`model: "deepseek-chat"`
- Qwen:
  `baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1"`，`model: "qwen-max"`

## 提示词风格

`features.article.renderer.promptProfile`
控制同一条微信文章链路里的排序、摘要、标题、动态模板和 AI 配图口径。默认值是
`technology`，适合 AI 科技资讯。

可选值：

- `technology`: AI 科技趋势，关注模型、产品、开源、工程和科技商业动态。
- `general`: 通用资讯，适合更宽泛的信息简报。
- `business`: 商业与产业，关注公司战略、资本、市场和产业信号。
- `product`: 产品与体验，关注产品更新、用户价值、设计和工作流。
- `developer`: 开发者与工程，关注开源、API、架构、部署和工程实践。
- `research`: 学术与研究，关注论文、方法、实验、评测和模型能力。

示例：

```ts
features: {
  article: {
    renderer: {
      template: "dynamic",
      promptProfile: "business",
    },
  },
},
```

## 微信文章模板

`features.article.renderer.template` 可选值：

- `default`: 微信原生正式风
- `modern`: 蓝青科技资讯风
- `tech`: 工程技术专栏风
- `mianpro`: AI 日报风
- `longform`: 杂志长文风
- `product`: 更新日志风
- `minimal`: 极简阅读风
- `darktech`: 深色研究笔记风
- `dynamic`: AI 根据本次文章内容实时生成公众号内联 HTML，失败自动回退 `minimal`
- `random`: 每次随机选择一个模板

## 定时任务

服务启动后每天凌晨 3 点（`Asia/Shanghai`）固定执行微信文章发布工作流
`weixin-article-workflow`。项目不再按星期切换其他工作流。

## 排查建议

- 每次改完 `trendpublish.config.ts` 后先跑 `deno task doctor`。
- 先跑 `deno task preview`，再跑 `deno task article:dry`，最后再正式发布。
- 新环境建议先关闭 `features.article.deduplication.enabled`
  和通知，跑通主链路后再逐项开启。
- 本地真实的 `trendpublish.config.ts` 已加入 `.gitignore`，不要提交真实密钥。
