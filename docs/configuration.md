# 配置说明

本项目使用 `.env` 作为主要配置来源。建议从 `.env.example` 复制后逐步填充。

## 必填配置（最小可运行）

```bash
SERVER_API_KEY=your-api-key
WEIXIN_APP_ID=your_app_id
WEIXIN_APP_SECRET=your_app_secret
DEFAULT_LLM_PROVIDER=DEEPSEEK
DEEPSEEK_API_KEY=your_api_key
```

## 常用配置分组

### 1. 模型与摘要

- `DEFAULT_LLM_PROVIDER`: 默认供应商（`OPENAI | DEEPSEEK | QWEN | XUNFEI | CUSTOM`）
- `AI_CONTENT_RANKER_LLM_PROVIDER`: 内容排序模型，支持 `PROVIDER:model` 形式
- `AI_SUMMARIZER_LLM_PROVIDER`: 摘要模型，支持 `PROVIDER:model` 形式

示例：

```bash
AI_CONTENT_RANKER_LLM_PROVIDER="DEEPSEEK:deepseek-reasoner"
AI_SUMMARIZER_LLM_PROVIDER="QWEN:qwen-max"
```

### 2. 抓取与检索

- `FIRE_CRAWL_API_KEY`: FireCrawl 抓取
- `JINA_API_KEY`: Jina Reader / DeepSearch / Embedding / Rerank
- `X_API_BEARER_TOKEN`: Twitter/X 抓取
- `XQUIK_API_KEY`: 可选，Twitter/X 抓取备用来源

### 3. 微信发布

- `WEIXIN_APP_ID`
- `WEIXIN_APP_SECRET`
- `NEED_OPEN_COMMENT`
- `ONLY_FANS_CAN_COMMENT`
- `AUTHOR`
- `ARTICLE_TEMPLATE_TYPE`: 微信文章模板类型。

文章模板可选值：

- `default`: 微信原生正式风
- `modern`: 蓝青科技资讯风
- `tech`: 工程技术专栏风
- `mianpro`: AI 日报风
- `longform`: 杂志长文风
- `product`: 更新日志风
- `minimal`: 极简阅读风
- `darktech`: 深色研究笔记风
- `random`: 每次随机选择一个模板

示例：

```bash
ARTICLE_TEMPLATE_TYPE="minimal"
```

### 4. 定时任务与工作流映射

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

### 5. 通知

- Bark: `ENABLE_BARK`, `BARK_URL`
- 钉钉: `ENABLE_DINGDING`, `DINGDING_WEBHOOK`
- 飞书: `ENABLE_FEISHU`, `FEISHU_WEBHOOK_URL`

## 配置建议

- 先跑通最小配置，再逐步开启数据库与通知。
- 新环境先关闭非核心能力（如通知），降低排查复杂度。
- API Key 不要写入仓库，统一走 `.env` 与 CI Secret。
