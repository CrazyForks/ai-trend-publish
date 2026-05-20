# TrendPublish

基于 Deno
开发的趋势发现和内容发布系统，支持多源数据采集、智能总结和自动发布到微信公众号。

![star](https://atomgit.com/liyown/ai-trend-publish/star/badge.svg)

> 🌰 示例公众号：**AISPACE科技空间**

点击加入discard频道：https://discord.gg/mrZvBHNawS 点击加入 QQ
群聊：<a href="https://qun.qq.com/universal-share/share?ac=1&authKey=E68gaXeajH49WXeIiawSS2Smr6uaSYe5zG9VDAEZa6sJgnNTcZd5X7r%2Fi3G6qVOa&busi_data=eyJncm91cENvZGUiOiI3Mzc5MDI3MzEiLCJ0b2tlbiI6Ijd2ZWN6THd6VFQ1TkNvYVJwQVpIbEtRSlM2UTJnYWhlMGxVMWhGUlNKMkV3MytoQWl6bUdNRGl3QjE0bklJMTUiLCJ1aW4iOiIxNTM2NzI3OTI1In0%3D&data=x1m4pt9JPKytsxKlmRh7duo4bnkRCLdhOFY_BhQenSr2dav7_0PoNpJc2sMzZdj3sKt9EPMR_AD9hlwI78HKUA&svctype=4&tempid=h5_group_info" target="_blank" rel="noopener noreferrer">
点击链接加入群聊【TrendPublish-1】
</a>

> 即刻关注，体验 AI 智能创作的内容～

## 🛠 开发环境

- **运行环境**: [Deno](https://deno.land/) v2.0.0 或更高版本
- **开发语言**: TypeScript
- **操作系统**: Windows/Linux/MacOS

## 🔌 外部服务兼容

TrendPublish 默认围绕“一套 LLM + 微信公众号发布”工作，其他能力按需开启。
所有配置项都在 `.env.example` 中有示例，运行 `deno task doctor`
可以按已开启功能检查缺失项。

| 功能        | 支持服务 / 接口                                 | 用途                                   | 配置项                                                                                     | 什么时候必需             |
| ----------- | ----------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| LLM         | OpenAI Chat Completions 兼容接口                | 内容排序、摘要润色、标题、动态微信模板 | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`                                                 | 必需                     |
| LLM         | OpenAI、DeepSeek、通义千问 DashScope 兼容模式等 | 通过统一 `LLM_*` 接入                  | 同上                                                                                       | 任选一个                 |
| 微信发布    | 微信公众号草稿 / 发布接口                       | 上传封面、上传正文图片、创建文章       | `WEIXIN_APP_ID`, `WEIXIN_APP_SECRET`                                                       | 正式发布必需             |
| 生图        | 阿里云百炼 / DashScope 通义万相                 | 生成公众号封面图                       | `DASHSCOPE_API_KEY`                                                                        | 可选，失败会走兜底图     |
| 抓取        | FireCrawl                                       | 网页内容抓取                           | `FIRE_CRAWL_API_KEY`                                                                       | 文章工作流至少一种抓取源 |
| 抓取        | Twitter/X API                                   | X/Twitter 内容抓取                     | `X_API_BEARER_TOKEN`                                                                       | 文章工作流至少一种抓取源 |
| 抓取        | Xquik                                           | Twitter/X 备用抓取源                   | `XQUIK_API_KEY`                                                                            | 文章工作流至少一种抓取源 |
| 抓取 / 检索 | Jina Reader、Jina DeepSearch                    | URL 阅读、深度搜索                     | `JINA_API_KEY`                                                                             | 可选                     |
| Embedding   | DashScope OpenAI-compatible Embedding           | 文章向量去重                           | `DASHSCOPE_EMBEDDING_BASE_URL`, `DASHSCOPE_EMBEDDING_API_KEY`, `DASHSCOPE_EMBEDDING_MODEL` | 开启去重时需要           |
| Embedding   | Jina Embeddings                                 | 向量能力 provider 兼容                 | `JINA_API_KEY`                                                                             | 可选                     |
| Rerank      | Jina Reranker                                   | 重排 provider 兼容                     | `JINA_API_KEY`                                                                             | 可选                     |
| 通知        | Bark                                            | 工作流状态通知                         | `ENABLE_BARK`, `BARK_URL`                                                                  | 可选                     |
| 通知        | 钉钉机器人                                      | 工作流状态通知                         | `ENABLE_DINGDING`, `DINGDING_WEBHOOK`                                                      | 可选                     |
| 通知        | 飞书机器人                                      | 工作流状态通知                         | `ENABLE_FEISHU`, `FEISHU_WEBHOOK_URL`                                                      | 可选                     |
| 存储        | MySQL                                           | 数据源配置、向量去重数据               | `ENABLE_DB`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`                 | 可选                     |

最小可运行配置只需要：

```bash
SERVER_API_KEY=your-api-key
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=your-api-key
LLM_MODEL=deepseek-chat
```

常见组合：

- 只本地预览模板：配置 `LLM_*` 后运行 `deno task preview`。
- 跑微信文章 dry-run：配置 `LLM_*`，并至少配置
  `FIRE_CRAWL_API_KEY`、`X_API_BEARER_TOKEN` 或 `XQUIK_API_KEY` 之一。
- 正式发布公众号：额外配置 `WEIXIN_APP_ID`、`WEIXIN_APP_SECRET`，并确认公众号 IP
  白名单。
- 生成封面图：配置 `DASHSCOPE_API_KEY`，未配置或生成失败时会使用默认兜底封面。
- 开启文章去重：设置 `ENABLE_DEDUPLICATION=true`，并配置 DashScope Embedding 和
  MySQL。

## 🚀 快速开始

感谢 https://github.com/233cy 提供的入门教程
https://mp.weixin.qq.com/s/cpfNsezIA3OOvxHLdcdmkg

### 1. 安装 Deno

Windows (PowerShell):

```powershell
irm https://deno.land/install.ps1 | iex
```

MacOS/Linux:

```bash
curl -fsSL https://deno.land/install.sh | sh
```

### 2. 克隆项目

```bash
git clone https://github.com/liyown/ai-trend-publish
cd ai-trend-publish
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件配置必要的环境变量
```

### 4. 开发和运行

```bash
# 检查配置
deno task doctor

# 启动服务
deno task dev

# 预览微信模板
deno task preview

# dry-run 跑一次微信文章流程，不真正发布
deno task article:dry

# 运行测试
deno task test

# 完整开发校验
deno task verify

# 编译Windows版本
deno task build:windows

# 编译Mac版本
deno task build:mac-x64    # Intel芯片
deno task build:mac-arm64  # M系列芯片

# 编译Linux版本
deno task build:linux-x64   # x64架构
deno task build:linux-arm64 # ARM架构

# 编译所有平台
deno task build:all
```

### 5. 文档开发（VitePress）

```bash
# 安装文档依赖
npm install

# 本地预览文档
npm run docs:dev

# 构建文档
npm run docs:build
```

## 🌟 主要功能

- 🤖 多源数据采集

  - Twitter/X 内容抓取
  - Xquik 可作为 Twitter/X 抓取备用来源
  - 网站内容抓取 (基于 FireCrawl)
  - Jina Reader / DeepSearch 抓取和搜索
  - 支持自定义数据源配置

- 🧠 AI 智能处理

  - 支持 OpenAI Chat Completions 兼容模型，如 OpenAI、DeepSeek、通义千问等
  - 关键信息提取
  - 智能标题生成
  - 支持 DashScope / Jina Embedding 和 Jina Rerank

- 📢 自动发布

  - 微信公众号文章发布
  - 自定义文章模板
  - 阿里云百炼 / DashScope 通义万相封面图生成
  - 定时发布任务

- 📱 通知系统
  - Bark 通知集成
- 钉钉通知集成
- 飞书通知集成
  - 任务执行状态通知
  - 错误告警

## 📝 文章模板

TrendPublish 提供了多种微信公众号文章模板，可通过 `ARTICLE_TEMPLATE_TYPE`
选择：`default`、`modern`、`tech`、`mianpro`、
`longform`、`product`、`minimal`、`darktech`、`dynamic` 或 `random`。查看
[模板展示页面](https://liyown.github.io/ai-trend-publish/templates)
了解更多详情。

`dynamic` 会在发布时调用 AI 根据本次文章内容实时生成完整的公众号内联 HTML，
并在生成失败时自动回退到 `minimal`。

常用调试命令：

```bash
deno task preview
deno task article:dry
```

`article:dry` 会跳过微信公众号 IP 白名单检查、封面上传、正文图片上传和正式发布，
并把渲染后的 HTML 输出到 `src/temp/dry_run_weixin_article_*.html`。

## DONE

- [x] 微信公众号文章发布
- [x] 大模型每周排行榜
- [x] 热门AI相关仓库推荐
- [x] 添加通义千问（Qwen）支持
- [x] 使用统一 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 配置全局模型
- [x] 新增配置体检、微信模板预览和文章 dry-run 命令

## Todo

- [ ] 热门AI相关论文推荐
- [ ] 热门AI相关工具推荐
- [ ] FireCrawl 自动注册免费续期

## 优化项

- [ ] 内容插入相关图片
- [x] 内容去重
- [ ] 降低AI率
- [ ] 文章图片优化
- [ ] ...

## 进阶

- [ ] 提供exe可视化界面

## 🛠 技术栈

- **运行环境**: Deno + TypeScript
- **AI 服务**: OpenAI Chat Completions
  兼容模型、DeepSeek、通义千问、通义万相、Jina AI (see
  [Integration Guide](docs/integrations/jina-integration-guide.md))
- **数据源**:
  - Twitter/X API
  - FireCrawl
  - Jina AI (for scraping and search, see
    [Integration Guide](docs/integrations/jina-integration-guide.md))
- **模板引擎**: EJS
- **开发工具**:
  - Deno
  - TypeScript

## 🚀 快速开始

### 环境要求

- Deno (v2+)
- TypeScript

### 安装

1. 克隆项目

```bash
git clone https://github.com/liyown/ai-trend-publish
```

2. 配置环境变量

```bash
cp .env.example .env
# 先填最小配置，再按需开启抓取、发布、生图、去重和通知
deno task doctor
```

## ⚙️ 环境变量配置

在 `.env` 文件中配置必要的环境变量。完整说明见
[配置说明](docs/configuration.md)，Jina 相关能力见
[Jina Integration Guide](docs/integrations/jina-integration-guide.md)。

## ⚠️ 配置IP白名单

在使用微信公众号相关功能前,请先将本机IP添加到公众号后台的IP白名单中。

### 操作步骤

1. 查看本机IP: [IP查询工具](https://tool.lu/ip/)
2. 登录微信公众号后台,添加IP白名单

### 图文指南

<div align="center">
  <img src="https://oss.liuyaowen.cn/images/202503051122480.png" width="200" style="margin-right: 20px"/>
  <img src="https://oss.liuyaowen.cn/images/202503051122263.png" width="400" />
</div>

4. 启动项目

```bash
# 配置体检
deno task doctor

# 运行
deno task dev

详细运行时间见 src\controllers\cron.ts
```

## 📦 部署指南

### 方式一：直接部署

1. 在服务器上安装 Deno

Windows:

```powershell
irm https://deno.land/install.ps1 | iex
```

Linux/MacOS:

```bash
curl -fsSL https://deno.land/install.sh | sh
```

2. 克隆项目

```bash
git clone https://github.com/liyown/ai-trend-publish.git
cd ai-trend-publish
```

3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件配置必要的环境变量
```

4. 启动服务

```bash
# 开发模式（支持热重载）
deno task dev

# dry-run 验证微信文章流程
deno task article:dry

# 使用PM2进行进程管理（推荐）
npm install -g pm2
pm2 start --interpreter="deno" --interpreter-args="run --allow-all" src/main.ts
```

5. 设置开机自启（可选）

```bash
# 使用PM2设置开机自启
pm2 startup
pm2 save
```

### 方式二：Docker 部署

1. 拉取代码

```bash
git clone https://github.com/liyown/ai-trend-publish.git
```

2. 构建 Docker 镜像：

```bash
# 构建镜像
docker build -t ai-trend-publish .
```

4. 运行容器：

```bash
# 方式1：通过环境变量文件运行
docker run -d --env-file .env --name ai-trend-publish-container ai-trend-publish

# 方式2：直接指定环境变量运行
docker run -d \
  -e XXXX=XXXX \
  ...其他环境变量... \
  --name ai-trend-publish-container \
  ai-trend-publish
```

### CI/CD 自动部署

项目已配置 GitHub Actions 自动部署流程：

1. 推送代码到 main 分支会自动触发部署
2. 也可以在 GitHub Actions 页面手动触发部署
3. 确保在 GitHub Secrets 中配置以下环境变量：
   - `SERVER_HOST`: 服务器地址
   - `SERVER_USER`: 服务器用户名
   - `SSH_PRIVATE_KEY`: SSH 私钥
   - 其他必要的环境变量（参考 .env.example）

## 模板开发指南

本项目支持自定义模板开发，主要包含以下几个部分：

### 1. 了解数据结构

查看 `src/modules/render/interfaces`
目录下的类型定义文件，了解各个渲染模块需要的数据结构

### 2. 开发模板

在 `src/modules/render/weixin/templates` 目录下按照对应模块开发 EJS 模板。
动态模板逻辑位于 `src/modules/render/weixin/dynamic`，不依赖固定 EJS 文件。

### 3. 注册模板

在对应的渲染器类中注册新模板，如 `WeixinArticleTemplateRenderer`：

### 4. 测试渲染效果

```
deno task preview
```

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

## ❤️ 特别感谢

感谢以下贡献者对项目的支持：

<a href="https://github.com/kilimro">
  <img src="https://avatars.githubusercontent.com/u/52153481?v=4" width="50" height="50" alt="kilimro">
</a>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=liyown/ai-trend-publish&type=Date)](https://star-history.com/#liyown/ai-trend-publish&Date)

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

### JSON-RPC API

提供了基于 JSON-RPC 2.0 协议的 API，支持手动触发工作流。

- 端点: `/api/workflow`
- 支持方法: `triggerWorkflow`
- 详细文档:
  [JSON-RPC API 文档](https://liyown.github.io/ai-trend-publish/api/json-rpc-api)

![](https://oss.liuyaowen.cn/image/202504242031044.png)
