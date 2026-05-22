# TrendPublish

TrendPublish 是一个基于 Deno 和 TypeScript
的微信文章自动发布系统。它可以抓取网页、RSS、Twitter/X
等数据源，使用大模型完成内容排序、摘要、标题、排版和配图，最后生成并发布到微信公众号。

项目当前聚焦一条主链路：**微信文章发布**。配置集中在
`trendpublish.config.ts`，可以用 TypeScript
类型提示组织模型、抓取源、模板、图片、去重和通知能力。

![star](https://atomgit.com/liyown/ai-trend-publish/star/badge.svg)

示例公众号：**AISPACE科技空间**

社区交流：

- Discord: https://discord.gg/mrZvBHNawS
- QQ 群：
  <a href="https://qun.qq.com/universal-share/share?ac=1&authKey=E68gaXeajH49WXeIiawSS2Smr6uaSYe5zG9VDAEZa6sJgnNTcZd5X7r%2Fi3G6qVOa&busi_data=eyJncm91cENvZGUiOiI3Mzc5MDI3MzEiLCJ0b2tlbiI6Ijd2ZWN6THd6VFQ1TkNvYVJwQVpIbEtRSlM2UTJnYWhlMGxVMWhGUlNKMkV3MytoQWl6bUdNRGl3QjE0bklJMTUiLCJ1aW4iOiIxNTM2NzI3OTI1In0%3D&data=x1m4pt9JPKytsxKlmRh7duo4bnkRCLdhOFY_BhQenSr2dav7_0PoNpJc2sMzZdj3sKt9EPMR_AD9hlwI78HKUA&svctype=4&tempid=h5_group_info" target="_blank" rel="noopener noreferrer">TrendPublish-1</a>

## 核心能力

- 多源抓取：支持普通 URL、RSS/RSSHub、FireCrawl、Jina Reader / DeepSearch、
  Twitter/X 与 Xquik。
- AI 内容处理：支持 OpenAI Chat Completions
  兼容接口，用于排序、摘要、润色、标题和动态模板生成。
- 微信文章渲染：内置多套公众号模板，支持 `dynamic` 动态模板和 `minimal`
  等静态模板。
- 智能配图：支持阿里云百炼 / DashScope 通义万相生成封面图和可选正文配图。
- 服务覆盖：大模型、数据源获取、图片生成、发布、通知和存储都按能力拆分，
  现在能直接使用，后续也方便继续补充。
- 发布与调试：支持微信公众号草稿/发布接口，也支持 dry-run 输出本地 HTML。
- 可选增强：支持本地 SQLite / Cloudflare D1 向量去重，以及
  Bark、钉钉、飞书工作流通知。

## 适合场景

- 每天自动整理技术、产品、商业或研究资讯，并发布到微信公众号。
- 使用固定数据源生成 AI 资讯简报。
- 用可控模板生成公众号正文，减少手动排版成本。
- 需要先本地预览、dry-run 验证，再正式发布的内容工作流。

## 快速开始

### 1. 安装运行环境

需要 Deno v2.0.0 或更高版本。

Windows:

```powershell
irm https://deno.land/install.ps1 | iex
```

macOS / Linux:

```bash
curl -fsSL https://deno.land/install.sh | sh
```

### 2. 克隆项目

```bash
git clone https://github.com/liyown/ai-trend-publish
cd ai-trend-publish
```

### 3. 创建配置

```bash
cp trendpublish.config.example.ts trendpublish.config.ts
deno task doctor
```

最小配置只需要服务密钥和一套大模型配置：

```ts
import { defineConfig } from "./src/utils/config/define-config.ts";

export default defineConfig({
  server: {
    apiKey: "your-api-key",
  },
  providers: {
    ai: {
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "your-ai-api-key",
      model: "deepseek-chat",
    },
  },
  features: {
    article: {
      dryRun: true,
      renderer: {
        template: "minimal",
        promptProfile: "technology",
      },
      sources: [
        "https://news.ycombinator.com/",
      ],
    },
  },
});
```

更多配置见 [配置说明](docs/configuration.md)。

### 4. 本地验证

```bash
# 检查配置和必填项
deno task doctor

# 预览全部微信模板
deno task preview

# 跑一次微信文章流程，不上传、不发布
deno task article:dry

# 启动服务和定时任务
deno task dev
```

`article:dry` 会把渲染后的 HTML 输出到 `src/temp/`，适合正式发布前检查正文效果。

## 配置原则

TrendPublish 的配置分成两层：

- `providers`：只放外部服务凭证和默认能力参数。
- `features.article`：决定微信文章工作流开启哪些功能、选择哪个
  provider、使用什么参数。

例如，开启正文 AI 配图时：

```ts
providers: {
  image: {
    dashscope: { apiKey: "your-dashscope-api-key" },
  },
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

这样可以避免“凭证配置”和“功能开关”混在一起。

## 常用功能开关

| 目标           | 配置位置                                  | 说明                                                                         |
| -------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| 选择文章模板   | `features.article.renderer.template`      | 支持 `minimal`、`longform`、`product`、`dynamic` 等                          |
| 选择提示词风格 | `features.article.renderer.promptProfile` | 支持 `technology`、`business`、`product`、`developer`、`research`、`general` |
| 配置数据源     | `features.article.sources`                | 直接写 URL，也可以用 `group:url` 指定抓取分组                                |
| 配置抓取策略   | `fetchGroups`                             | 分组内 provider 按顺序 fallback                                              |
| 开启封面生图   | `features.article.cover`                  | 需要 `providers.image.dashscope.apiKey`                                      |
| 开启正文配图   | `features.article.bodyImages`             | 失败时回退已有原文图片布局                                                   |
| 开启向量去重   | `features.article.deduplication`          | 需要 embedding provider；本地/Docker 用 SQLite，Cloudflare 用 D1             |
| 开启通知       | `features.article.notifications.channels` | 支持 Bark、钉钉、飞书                                                        |
| 正式发布微信   | `features.article.dryRun: false`          | 本地固定 IP 用 `weixin`，Cloudflare 推荐 `weixin-relay`                      |

完整字段说明见 [配置说明](docs/configuration.md)。

## 数据源写法

最简单的写法是直接放 URL：

```ts
features: {
  article: {
    sources: [
      "https://news.ycombinator.com/",
      "https://openai.com/news/",
    ],
  },
},
fetchGroups: {
  default: ["auto"],
},
```

需要指定抓取策略时，可以使用自定义分组前缀：

```ts
providers: {
  fetch: {
    firecrawl: { apiKey: "your-firecrawl-api-key" },
    jina: { apiKey: "your-jina-api-key" },
    twitter: { xquikApiKey: "your-xquik-api-key" },
  },
},
fetchGroups: {
  default: ["auto"],
  web: ["firecrawl", "jina"],
  social: ["twitter"],
},
features: {
  article: {
    sources: [
      "web:https://openai.com/news/",
      "social:https://x.com/OpenAIDevs",
    ],
  },
},
```

`web:` 和 `social:` 不是固定 provider 名，而是你自己定义的抓取分组名。

## 支持的服务

当前版本建议先用一套稳定的大模型配置跑通主链路，再按需开启抓取增强、图片生成、
去重和通知。

### AI 大模型

- OpenAI：[申请地址](https://platform.openai.com/api-keys)； `baseUrl` 填
  `https://api.openai.com/v1`；`model` 按平台模型列表选择。
- DeepSeek：[申请地址](https://platform.deepseek.com/api_keys)； `baseUrl` 填
  `https://api.deepseek.com/v1`；常用模型为 `deepseek-chat`、
  `deepseek-reasoner`。
- 通义千问 / DashScope：[申请地址](https://bailian.console.aliyun.com/)；\
  `baseUrl` 填 `https://dashscope.aliyuncs.com/compatible-mode/v1`；常用模型为\
  `qwen-plus`、`qwen-max`。

### 数据源获取

- 普通网页 URL：直接写到 `features.article.sources`。
- RSS / RSSHub：直接写 RSS URL；RSSHub 可配置 `providers.fetch.rss.baseUrl`。
- FireCrawl：[申请地址](https://firecrawl.dev/)；配置
  `providers.fetch.firecrawl.apiKey`。
- Jina Reader / DeepSearch：[申请地址](https://jina.ai/reader/)；配置
  `providers.fetch.jina.apiKey`。
- Twitter/X：[申请地址](https://developer.x.com/)；配置
  `providers.fetch.twitter.bearerToken`。
- Xquik：[申请地址](https://xquik.com/en/api-keys)；配置
  `providers.fetch.twitter.xquikApiKey`。
- 后续：GitHub、Hacker News、Product Hunt、YouTube、搜索引擎结果源。

### 图片生成

- 阿里云百炼 / DashScope
  通义万相：[申请地址](https://bailian.console.aliyun.com/)； 配置
  `providers.image.dashscope.apiKey`。
- 封面图默认模型：`wanx-poster-generation-v1`。
- 正文配图通过 `features.article.bodyImages` 开启，可设置生成数量和尺寸。
- 后续：OpenAI Images、Gemini / Imagen、Replicate、Stability、ComfyUI。

### 发布与素材

- 微信公众号：[申请地址](https://mp.weixin.qq.com/)；配置
  `providers.publish.weixin.appId` 和 `providers.publish.weixin.appSecret`。
- Cloudflare 真实发布推荐使用 `weixin-relay`，微信凭证只放在固定 IP 机器上。
- 当前支持：封面上传、正文图片上传、草稿创建和发布。
- 正式发布前需要在公众号后台配置 IP 白名单。
- 后续：Twitter/X thread、Telegram、飞书文档、Notion、静态站点、Webhook。

### 去重、存储和通知

- 向量去重：DashScope Embedding；常用模型为 `text-embedding-v3`。
- 存储：本地/Docker 使用文件和 SQLite；Cloudflare 原生模式使用 R2、KV、D1。
- 通知：当前支持 Bark、钉钉机器人、飞书机器人。
- 后续：OpenAI / Jina / BGE Embedding、PostgreSQL、SQLite、Vectorize、
  企业微信、Telegram、Slack、Discord、邮件通知。

## 微信模板

模板通过 `features.article.renderer.template` 选择：

- `minimal`：极简阅读风，适合稳定日更。
- `longform`：长文杂志风，适合深度整理。
- `product`：产品更新风，适合产品、工具、版本动态。
- `darktech`：深色研究笔记风。
- `dynamic`：AI 根据本次文章内容实时生成公众号正文 HTML，失败时自动回退
  `minimal`。

也可以使用 `default`、`modern`、`tech`、`mianpro`、`random`。模板展示见
[模板文档](docs/templates.md) 或
[在线展示](https://liyown.github.io/ai-trend-publish/templates)。

## 常用命令

```bash
# 配置体检
deno task doctor

# 格式化、lint、类型检查和单元测试
deno task verify

# 只运行单元测试
deno task test

# 本地模板预览
deno task preview

# 微信文章 dry-run
deno task article:dry

# 正式执行微信文章工作流
deno task article

# Docker 本地开发构建
deno task docker:build

# 固定 IP 机器上的微信发布中转服务
deno task weixin:relay

# 一键安装 relay 为 systemd 保活服务
deno task relay:install --config ./config/trendpublish.config.ts --port 8080

# 生成 relay 的 systemd 保活服务文件
deno task relay:systemd

# Cloudflare Worker/Workflow 类型检查
deno task cf:check

# Cloudflare 打包 dry-run，不真正部署
deno task cf:dry-run

# Cloudflare 本地 D1 migration + 本地 Worker
deno task cf:migrate:local
deno task cf:dev

# Cloudflare 远端 D1 migration + 部署
deno task cf:migrate:remote
deno task cf:deploy

# 部署后健康检查和 dry-run 冒烟
deno task cf:smoke --url https://your-worker.workers.dev --api-key your-api-key

# 编译当前平台二进制
deno task build

# 编译全部平台
deno task build:all
```

## 项目结构

```text
src/
  app/weixin-article/          # 应用组装层：创建 provider、规划抓取、定义 workflow
  features/weixin-article/     # 微信文章业务模型、服务、渲染和 workflow
  integrations/                # 外部服务 adapter：LLM、fetch、image、publish、notify、vector
  core/                        # workflow runtime、ports 和通用基础能力
  modules/                     # 内容排序、摘要、Markdown 转换等内部可复用能力
  platform/cloudflare/         # Cloudflare 可选部署入口
  platform/local/              # 本地 artifact 和运行状态存储
  utils/config/                # TypeScript 配置定义、解析与校验
```

架构细节见 [架构总览](docs/architecture.md)。

## 发布与部署

本地或服务器直接运行：

```bash
deno task doctor
deno task article:dry
deno task dev
```

Docker 推荐使用已经发布到 GHCR 的镜像：

```bash
docker pull ghcr.io/liyown/ai-trend-publish:latest
docker compose up -d
```

容器默认读取 `/app/config/trendpublish.config.ts`，通常把本地
`./config/trendpublish.config.ts` 挂载进去即可。镜像由 GitHub Actions 自动构建，
不需要在服务器上本地构建。

微信 relay 也是同一个镜像、同一个配置文件名，只是启动命令不同：

```bash
cp trendpublish.config.example.ts config/trendpublish.config.ts
deno task docker:relay:up
```

Cloudflare 提供 Worker / Workflows 原生入口，适合远程 HTTP 触发或 Cron
定时发布。运行状态写入 KV/D1，文章产物和 dry-run HTML 写入 R2 或 KV
fallback，并可通过 `/dashboard` 查看步骤、错误和产物。部署后可以用
`deno task cf:smoke` 检查 `/api/health`、创建一次 dry-run
Workflow，并轮询到最终结果。Cloudflare 真实发布 建议调用固定 IP 机器上的
`weixin-relay`，避免微信 IP 白名单问题。

正式发布微信公众号前，需要：

1. 本地/Docker 直连发布：配置 `providers.publish.weixin.appId` 和
   `providers.publish.weixin.appSecret`。
2. Cloudflare 发布：部署 `weixin-relay`，配置
   `providers.publish.weixinRelay.url/token`。
3. 在公众号后台配置固定 IP 机器的白名单。
4. 先跑 dry-run 检查正文和图片。
5. 再设置 `features.article.dryRun: false` 执行真实发布。

部署细节见 [部署文档](docs/deployment.md)。

## JSON-RPC API

服务启动后提供 `POST /api/workflow`，可手动触发微信文章工作流。

```bash
curl -X POST http://localhost:8000/api/workflow \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "jsonrpc": "2.0",
    "method": "triggerWorkflow",
    "params": {
      "workflowType": "weixin-article-workflow",
      "dryRun": true
    },
    "id": 1
  }'
```

更多说明见 [JSON-RPC API 文档](docs/api/json-rpc-api.md)。

## 相关文档

- [快速开始](docs/getting-started.md)
- [配置说明](docs/configuration.md)
- [架构总览](docs/architecture.md)
- [模板文档](docs/templates.md)
- [部署文档](docs/deployment.md)
- [Jina 集成指南](docs/integrations/jina-integration-guide.md)
- [钉钉通知指南](docs/integrations/dingtalk-webhook-guide.md)

## 社区与贡献

- Discord: [https://discord.gg/mrZvBHNawS](https://discord.gg/mrZvBHNawS)
- QQ 群：TrendPublish-1

欢迎提交 Issue 和 Pull Request。建议在提交前先运行：

```bash
deno task verify
```

## 致谢

感谢社区贡献者对项目的支持。

## Star History

[Star History Chart](https://star-history.com/#liyown/ai-trend-publish&Date)

## License

本项目使用 MIT License，详见 [LICENSE](LICENSE)。
