# 快速开始

## 1. 环境要求

- Deno v2.0.0+
- Node.js 18+（用于 VitePress 文档）

## 2. 克隆项目

```bash
git clone https://github.com/liyown/ai-trend-publish
cd ai-trend-publish
```

## 3. 初始化配置

```bash
cp trendpublish.config.example.ts trendpublish.config.ts
```

至少先完成以下字段：

- `server.apiKey`
- `providers.ai.baseUrl`
- `providers.ai.apiKey`
- `providers.ai.model`

正式发布公众号时再配置：

- `providers.publish.weixin.appId`
- `providers.publish.weixin.appSecret`

跑微信文章工作流时，至少配置一种抓取源：

- `features.article.sources`
- URL 对应的 `providers.fetch.*`

最简单的数据源写法是 URL 列表：

```ts
features: {
  article: {
    renderer: {
      promptProfile: "technology",
    },
    sources: [
      "https://news.ycombinator.com/",
      "social:https://x.com/OpenAIDevs",
    ],
  },
},
fetchGroups: {
  default: ["auto"],
  social: ["twitter"],
},
```

更多功能开关和必填项见 [配置说明](/configuration)。

## 4. 本地启动

```bash
# 检查配置是否完整
deno task doctor

# 启动主服务（含定时任务 + JSON-RPC 服务）
deno task dev

# 预览微信模板
deno task preview

# dry-run 跑一次微信文章流程，不真正发布
deno task article:dry
```

默认会启动在 `http://localhost:8000`，并暴露 `POST /api/workflow`。

## 5. 触发一次工作流

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

## 6. 文档开发（VitePress）

```bash
npm install
npm run docs:dev
npm run docs:build
```

## 7. 常用构建命令

```bash
# Windows
deno task build:windows

# macOS
deno task build:mac-x64
deno task build:mac-arm64

# Linux
deno task build:linux-x64
deno task build:linux-arm64
```
