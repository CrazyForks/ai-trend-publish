# 架构总览

## 运行结构

TrendPublish 现在按 modular monolith 组织。启动后主要有两条入口链路：

1. 定时任务链路（cron）
2. JSON-RPC 手动触发链路（HTTP API）

## 目录分层

- `src/core`：workflow runtime、通用运行时抽象和基础能力 ports。
- `src/features/weixin-article`：微信文章业务模型、领域服务、渲染实现和平台无关的
  业务 workflow。
- `src/app/weixin-article`：微信文章应用组装层，负责创建 provider、fetch
  planning/routing、workflow definition 和运行依赖。
- `src/integrations`：外部服务 provider 实现、adapter registry 与 resolver，包括
  fetch、LLM、image、vector、notify、publish。
- `src/registry`：通用 provider registry。
- `src/modules`：保留内容排序、摘要和 Markdown 转换等应用内可复用能力。
- `src/platform/cloudflare`：Cloudflare Workers / Workflows 部署入口。
- `src/utils/config`：TS 配置定义、解析与校验。

基础服务层统一使用三类对象：

- `Adapter`：声明 provider 的 `id`、`kind`、配置校验和创建方法。
- `Registry`：只负责注册和查找 adapter，不持有业务状态。
- `Resolver`：负责按配置创建、缓存和刷新 provider，例如
  `LlmProviderResolver`、`ImageGeneratorResolver`、`EmbeddingProviderResolver`。

`Factory` 命名不再用于基础 provider 装配，避免把“创建 + 缓存 + 刷新 +
选择”的职责 误表达成单纯工厂。

入口文件：

- 本地 CLI：`scripts/run.workflow.ts`
- 主服务：`src/index.ts`
- Cron：`src/controllers/cron.ts`
- JSON-RPC：`src/controllers/workflow.controller.ts`
- Cloudflare 类型入口：`src/platform/cloudflare/worker.ts`

## 执行流程

1. 解析 `features.article.sources` 和 `fetchGroups`。
2. 通过 fetch registry 推断或选择抓取 provider。
3. 按抓取分组顺序 fallback，抓取文章内容。
4. 去重、排序、摘要与标题生成。
5. 生成封面和可选正文配图。
6. 使用静态或动态微信模板渲染 HTML。
7. dry-run 写入本地 HTML，正式运行发布到公众号。
8. 发送通知（Bark/钉钉/飞书）。

## 工作流类型

当前主链路聚焦微信文章发布，固定使用 `weixin-article-workflow`。该工作流既可被
cron 调用，也可通过 `triggerWorkflow` API 手动触发。

历史独立 workflow 入口、模板和测试已经移除。新功能应围绕
`src/app/weixin-article` 和 `src/features/weixin-article` 扩展，不再新增并行的
历史 workflow 目录。

## 配置边界

配置只描述运行能力和功能开关：

- `providers`：外部服务凭证与能力配置。
- `fetchGroups`：数据源抓取策略。
- `features.article`：微信文章功能配置。
- `storage`：本地或远程存储配置。
- `server`：本地服务配置。

业务数据不再存入配置管理器，也不再从数据库合并运行配置。文章数据源统一来自
`features.article.sources`。

## 时区与调度

- 内置 cron: 每天 `03:00`
- 时区: `Asia/Shanghai`
- 每天固定执行微信文章发布工作流

## Cloudflare 边界

`src/platform/cloudflare/worker.ts` 当前作为可类型检查的可选部署入口保留，随
`deno task check` 校验。真实部署仍需要按目标环境配置 Wrangler bindings、
secrets、远程存储和调度触发器；本地 dry-run 输出文件不会直接映射到 Cloudflare
运行时文件系统。
