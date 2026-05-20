# 配置说明

本项目使用 `.env` 作为主要配置来源。建议从 `.env.example` 复制后逐步填充。

```bash
cp .env.example .env
deno task doctor
```

`doctor` 会按功能块检查配置，并把 `your_api_key`、`change-me`
这类占位值视为未配置。

## 最小配置

如果只是启动服务、预览模板、跑 AI 摘要和动态模板，先填这一组：

```bash
SERVER_API_KEY=your-api-key
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=your_api_key
LLM_MODEL=deepseek-chat
```

如果要正式发布到微信公众号，还必须填：

```bash
WEIXIN_APP_ID=your_app_id
WEIXIN_APP_SECRET=your_app_secret
```

## 功能开关与必需配置

| 想开启的功能             | 开关 / 使用方式                           | 必需配置                                                      | 说明                                       |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| 启动 JSON-RPC 服务       | `deno task dev`                           | `SERVER_API_KEY`                                              | API 请求需带 `Authorization: Bearer <key>` |
| AI 摘要、排序、动态模板  | 默认开启                                  | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`                    | 使用 OpenAI Chat Completions 兼容接口      |
| 本地模板预览             | `deno task preview`                       | `LLM_*`                                                       | 静态模板不依赖公众号配置                   |
| 微信文章 dry-run         | `deno task article:dry` 或 `DRY_RUN=true` | `LLM_*`，至少一个抓取源 key                                   | 不发布、不上传图片，会输出本地 HTML        |
| 微信公众号正式发布       | `deno task article`                       | `WEIXIN_APP_ID`, `WEIXIN_APP_SECRET`                          | 还需要公众号后台 IP 白名单                 |
| FireCrawl 抓取           | 配置 FireCrawl 数据源                     | `FIRE_CRAWL_API_KEY`                                          | 网页内容抓取                               |
| Twitter/X 抓取           | 配置 Twitter/X 数据源                     | `X_API_BEARER_TOKEN` 或 `XQUIK_API_KEY`                       | Xquik 是备用抓取源                         |
| Jina Reader / DeepSearch | 使用 Jina 抓取/检索 provider              | `JINA_API_KEY`                                                | 也可复用到 Jina Embedding / Reranker       |
| 阿里云封面生图           | 配置 `DASHSCOPE_API_KEY`                  | `DASHSCOPE_API_KEY`                                           | 未配置或失败时使用兜底封面                 |
| 文章向量去重             | `ENABLE_DEDUPLICATION=true`               | `DASHSCOPE_EMBEDDING_*`, `DB_*`                               | 当前文章去重会写入 MySQL                   |
| 数据库数据源             | `ENABLE_DB=true`                          | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` | 用数据库追加数据源配置                     |
| Bark 通知                | `ENABLE_BARK=true`                        | `BARK_URL`                                                    | 工作流状态通知                             |
| 钉钉通知                 | `ENABLE_DINGDING=true`                    | `DINGDING_WEBHOOK`                                            | 工作流状态通知                             |
| 飞书通知                 | `ENABLE_FEISHU=true`                      | `FEISHU_WEBHOOK_URL`                                          | 工作流状态通知                             |

## 推荐配置路径

### 1. 只看模板效果

```bash
SERVER_API_KEY=your-api-key
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=your_api_key
LLM_MODEL=deepseek-chat
ARTICLE_TEMPLATE_TYPE=minimal
```

运行：

```bash
deno task preview
```

### 2. 跑一次微信文章 dry-run

在最小配置基础上，至少配置一种抓取源：

```bash
FIRE_CRAWL_API_KEY=your_firecrawl_key
# 或
X_API_BEARER_TOKEN=your_twitterapi_key
# 或
XQUIK_API_KEY=your_xquik_key
```

运行：

```bash
deno task article:dry
```

### 3. 正式发布公众号

在 dry-run 跑通后，再配置：

```bash
WEIXIN_APP_ID=your_app_id
WEIXIN_APP_SECRET=your_app_secret
DRY_RUN=false
```

运行：

```bash
deno task article
```

### 4. 开启封面生图

```bash
DASHSCOPE_API_KEY=your_dashscope_key
```

封面生成失败不会中断主流程，会回退默认封面。

### 5. 开启文章去重

```bash
ENABLE_DEDUPLICATION=true
DASHSCOPE_EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_EMBEDDING_API_KEY=your_dashscope_key
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v3

ENABLE_DB=true
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_DATABASE=trendfinder
```

## 模型配置

默认情况下，全项目只使用一套模型配置，内容排序、摘要、标题生成和动态模板都会走这组配置。

常见兼容 OpenAI Chat Completions 的供应商示例：

- OpenAI: `LLM_BASE_URL="https://api.openai.com/v1"`，`LLM_MODEL="gpt-4o-mini"`
- DeepSeek:
  `LLM_BASE_URL="https://api.deepseek.com/v1"`，`LLM_MODEL="deepseek-chat"`
- Qwen:
  `LLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"`，`LLM_MODEL="qwen-max"`

旧版的
`DEFAULT_LLM_PROVIDER`、`AI_CONTENT_RANKER_LLM_PROVIDER`、`AI_SUMMARIZER_LLM_PROVIDER`
仍兼容，但不建议新配置继续拆分多套模型。

## 微信文章模板

`ARTICLE_TEMPLATE_TYPE` 可选值：

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

每天凌晨 3 点（`Asia/Shanghai`）执行一次，执行的工作流由下列键控制：

```bash
1_of_week_workflow=weixin-article-workflow
2_of_week_workflow=weixin-aibench-workflow
3_of_week_workflow=weixin-hellogithub-workflow
```

支持值：

- `weixin-article-workflow`
- `weixin-aibench-workflow`
- `weixin-hellogithub-workflow`

## 排查建议

- 每次改完 `.env` 后先跑 `deno task doctor`。
- 先跑 `deno task preview`，再跑 `deno task article:dry`，最后再正式发布。
- 新环境建议先关闭 `ENABLE_DB`、`ENABLE_DEDUPLICATION`
  和通知，跑通主链路后再逐项开启。
- API Key 不要写入仓库，统一走 `.env` 与 CI Secret。
