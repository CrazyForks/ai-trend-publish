# 部署

TrendPublish 不把配置退回到散落的运行变量。部署时仍然使用
`trendpublish.config.ts` 这份 TypeScript 配置：结构、功能开关和 provider
选择写在配置文件里，密钥或运行时变化的值可以在配置函数里显式读取。

## Docker 推荐方式

发布镜像由 GitHub Actions 自动构建并推送到当前仓库的容器注册表：

```bash
docker pull ghcr.io/liyown/ai-trend-publish:latest
```

镜像默认读取：

```text
/app/config/trendpublish.config.ts
```

主服务和微信 relay 使用同一个镜像、同一个配置文件结构，只是启动命令不同：

- 主服务：默认命令，启动 API、Cron 和本地/Docker workflow。
- 微信 relay：`deno task relay`，只转发微信公众号 API，适合放在固定 IP 机器上。

启动前准备本地配置和输出目录：

```bash
mkdir -p config data/temp
cp trendpublish.config.docker.example.ts config/trendpublish.config.ts
```

然后启动：

```bash
deno task docker
deno task docker logs
```

`docker-compose.yml` 默认使用发布镜像，不在服务器上重新构建：

```yaml
services:
  trendpublish:
    image: ghcr.io/liyown/ai-trend-publish:latest
    ports:
      - "8000:8000"
    volumes:
      - ./config/trendpublish.config.ts:/app/config/trendpublish.config.ts:ro
      - ./data/temp:/app/src/temp
```

如果没有挂载配置文件，服务会直接提示配置文件不存在，避免容器以空配置启动。

## Docker 配置写法

简单部署可以直接把完整配置写进挂载的 `config/trendpublish.config.ts`。

如果希望密钥由 Docker secrets 或平台变量提供，可以使用配置函数：

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
      renderer: {
        template: "minimal",
        promptProfile: "technology",
      },
      sources: ["https://news.ycombinator.com/"],
    },
  },
}));
```

读取规则：

- `runtime.value(name, fallback)` 读取普通运行值，缺失时使用 fallback。
- `runtime.secret(name, fallback)` 在 Docker 中优先读取 `/run/secrets/<name>`。
- `runtime.required(name)` 缺失时直接报错。

项目提供了 `trendpublish.config.docker.example.ts`，可以复制到
`config/trendpublish.config.ts` 后按自己的平台补齐。

## 指定配置文件

本地和 Docker 都支持显式指定配置路径：

```bash
deno task article --dry-run --config ./config/trendpublish.config.ts
deno task dev --config ./config/trendpublish.config.ts
```

也可以设置 `TRENDPUBLISH_CONFIG`，Docker 镜像默认已经设置为
`/app/config/trendpublish.config.ts`。

## 本地构建镜像

本地构建只建议用于开发验证：

```bash
deno task docker build
```

正式部署推荐使用 GHCR 发布镜像，这样服务器不需要安装 Deno
构建依赖，也不会把真实配置复制进镜像。

## 镜像发布

`.github/workflows/docker-image.yml` 会在以下场景构建并推送镜像：

- push 到 `main`
- GitHub Release 发布
- 手动触发 workflow

推送标签：

- `ghcr.io/liyown/ai-trend-publish:latest`
- `ghcr.io/liyown/ai-trend-publish:main`
- `ghcr.io/liyown/ai-trend-publish:<git-sha>`
- 发布 release 时额外推送 release tag，例如 `v1.2.3`

构建平台为 `linux/amd64` 和 `linux/arm64`。

## Cloudflare Workflow 原生部署

Cloudflare 部署使用 Worker + Workflows 直接编排微信文章流程，不需要
Container，也不需要给内部步骤额外暴露 HTTP 端点：

- Worker 提供 HTTP 手动触发和内置运行看板。
- Cron Triggers 定时创建 Workflow 运行实例。
- Workflows 负责步骤级执行、重试和状态恢复。
- R2 保存抓取结果、处理中间结果、HTML 和 dry-run preview。未启用 R2
  的账号可以先使用 KV artifact fallback 跑通轻量部署。
- KV 保存最近运行状态，D1 保存运行历史、步骤明细、发布结果和向量去重数据。
- 本地/Docker 使用 SQLite，Cloudflare 原生模式使用 D1；两者使用同一套表结构。
- 真实发布到微信公众号时，推荐通过固定 IP 机器上的 weixin-relay 调用微信 API。

入口文件：

```text
src/platform/cloudflare/worker.ts
```

Wrangler 配置：

```text
wrangler.jsonc
```

Cloudflare 示例配置：

```text
trendpublish.config.cloudflare.ts
```

先登录并确认当前账号：

```bash
deno run -A npm:wrangler login
deno run -A npm:wrangler whoami
```

`wrangler.jsonc` 已使用当前账号里真实创建的 KV 和 D1 资源。R2 未启用时，
Cloudflare 原生模式会把 artifact 临时写入 `ARTICLE_RUNS` KV，用于部署测试和
dry-run 验证。启用 R2 后，可以把 `r2_buckets` binding 加回
`wrangler.jsonc`，Worker 会自动优先使用 R2。

如果你希望提前手工创建资源，也可以运行：

```bash
deno run -A npm:wrangler kv namespace create ARTICLE_RUNS
deno run -A npm:wrangler r2 bucket create trendpublish-artifacts
deno run -A npm:wrangler d1 create trendpublish
```

手工创建时，把返回的资源信息填到 `wrangler.jsonc`：

```jsonc
{
  "kv_namespaces": [{ "binding": "ARTICLE_RUNS", "id": "真实 KV id" }],
  "r2_buckets": [
    { "binding": "ARTICLE_ARTIFACTS", "bucket_name": "真实 R2 bucket" }
  ],
  "d1_databases": [{
    "binding": "ARTICLE_DB",
    "database_name": "trendpublish",
    "database_id": "真实 D1 id",
    "migrations_dir": "migrations"
  }]
}
```

R2 bucket 使用 bucket name 绑定，一般不需要额外 id。

## Cloudflare 配置

`trendpublish.config.cloudflare.ts` 使用同样的
`defineConfig((runtime) => config)` 结构。常用 secrets / vars：

- `SERVER_API_KEY`
- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `ARTICLE_SOURCES`
- `FIRECRAWL_API_KEY`
- `JINA_API_KEY`
- `TWITTER_BEARER_TOKEN`
- `XQUIK_API_KEY`
- `DASHSCOPE_API_KEY`
- `WEIXIN_APP_ID`
- `WEIXIN_APP_SECRET`
- `WEIXIN_PUBLISH_PROVIDER`
- `WEIXIN_RELAY_URL`
- `WEIXIN_RELAY_TOKEN`

设置 secrets 示例：

```bash
deno run -A npm:wrangler secret put SERVER_API_KEY
deno run -A npm:wrangler secret put AI_API_KEY
```

dry-run 只需要 `SERVER_API_KEY`、`AI_API_KEY` 和数据源所需的抓取凭证。Cloudflare
真实发布推荐使用 relay：

```bash
deno run -A npm:wrangler secret put WEIXIN_PUBLISH_PROVIDER # weixin-relay
deno run -A npm:wrangler secret put WEIXIN_RELAY_URL
deno run -A npm:wrangler secret put WEIXIN_RELAY_TOKEN
```

也可以从本地 `trendpublish.config.ts` 同步 Cloudflare
secrets。脚本只打印变量名， 不会输出变量值：

```bash
deno task cf sync-secrets --env-file cloudflare-token.local
```

本地 Wrangler dev 可以复制 `.dev.vars.example`：

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` 只用于本机调试，已经被 `.gitignore` 忽略。

## Cloudflare 验证流程

先做 Worker 打包 dry-run：

```bash
deno task cf dry-run
```

`cf dry-run` 会先构建 dashboard，然后使用 Wrangler 打包 Worker 和 Workers Static
Assets。Cloudflare 上的 `/dashboard` 不再由 Worker 拼接 HTML
字符串，而是直接服务 `dist/dashboard` 里的前端资源。

初始化本地 D1，并启动本地 Worker：

```bash
deno task cf migrate:local
deno task cf dev
```

打开看板：

```text
http://localhost:8787/dashboard
```

首次进入看板时输入 `SERVER_API_KEY`。也可以直接检查健康状态：

```bash
curl -H "Authorization: Bearer <SERVER_API_KEY>" \
  http://localhost:8787/api/health
```

远端部署前先应用 D1 migration：

```bash
deno task cf migrate
```

然后部署：

```bash
deno task cf deploy
```

部署完成后做一次远端冒烟测试。这个脚本会调用 `/api/health`，创建一次
`dryRun: true` 的 Workflow，然后轮询运行状态直到成功或失败：

```bash
deno task cf smoke --url https://<your-worker>.<your-subdomain>.workers.dev \
  --api-key <SERVER_API_KEY>
```

HTTP 触发路径：

```text
GET  /api/health
GET  /api/config/summary
POST /api/runs
GET  /api/runs
GET  /api/runs/:runId
GET  /api/artifacts?key=...
GET  /dashboard
```

`POST /api/workflow` 仍保留为旧 JSON-RPC 兼容入口。新的看板和 REST API
使用同一个 `server.apiKey` 做 Bearer 鉴权。Cloudflare 环境支持
`dryRun: true`，dry-run HTML 会写入 R2，并可在 `/dashboard` 中打开。
看板触发真实发布时会要求二次确认；当前真实发布语义是创建微信公众号草稿。

## 微信发布 Relay

Cloudflare Worker 没有固定出口 IP，微信公众号真实发布通常又需要 IP
白名单。因此生产发布建议单独部署 weixin-relay 到一台固定公网 IP 机器。
这台机器只负责转发微信接口，不跑抓取、AI、排版 workflow：

```text
Cloudflare Workflow -> weixin-relay(固定 IP) -> 微信公众号 API
```

微信后台 IP 白名单只需要填写 relay 机器的公网 IP。微信 `appId/appSecret` 只放在
relay 机器上，不放 Cloudflare。

固定 IP 机器准备配置：

```bash
mkdir -p config
cp trendpublish.config.example.ts config/trendpublish.config.ts
```

编辑 `config/trendpublish.config.ts`，至少填这三项：

- `server.apiKey`：Cloudflare 调用 relay 的 Bearer Token。
- `providers.publish.weixin.appId`：微信公众号 AppID。
- `providers.publish.weixin.appSecret`：微信公众号 AppSecret。

如果这些字段还是 `change-me` / `your-*` 占位值，relay 会拒绝启动。
如果你已经有一份完整的 `trendpublish.config.ts`，直接挂载同一份即可，不需要
relay 专用配置文件。

启动 relay：

```bash
deno task docker relay
deno task docker relay logs
```

relay 使用的仍然是同一个发布镜像：

```yaml
image: ghcr.io/liyown/ai-trend-publish:latest
command: ["deno", "task", "relay"]
volumes:
  - ./config/trendpublish.config.ts:/app/config/trendpublish.config.ts:ro
```

检查 relay：

```bash
curl http://<relay-host>:8080/health
```

### 源码运行 relay

如果固定 IP 机器不想用 Docker，也可以直接从源码运行同一个 relay：

```bash
git clone https://github.com/liyown/ai-trend-publish.git
cd ai-trend-publish
mkdir -p config
cp trendpublish.config.example.ts config/trendpublish.config.ts
```

编辑 `config/trendpublish.config.ts`，填好 `server.apiKey` 和
`providers.publish.weixin.appId/appSecret`，然后前台启动：

如果你是从旧示例复制过来的配置文件，第一行请使用这个导入，避免放到 `config/`
目录后解析到错误路径：

```ts
import { defineConfig } from "@src/utils/config/define-config.ts";
```

```bash
PORT=8080 deno task relay --config ./config/trendpublish.config.ts
```

前台模式适合临时验证。生产环境建议用 systemd 保活：

```bash
deno task relay install \
  --config ./config/trendpublish.config.ts \
  --port 8080
```

这个命令会自动写入 `trendpublish-weixin-relay.service`、执行
`systemctl daemon-reload`，并启动开机自启。默认使用当前登录用户运行服务。

如果源码目录、配置路径或运行用户需要显式指定：

```bash
deno task relay install \
  --workdir /opt/ai-trend-publish \
  --config /opt/ai-trend-publish/config/trendpublish.config.ts \
  --user trendpublish \
  --port 8080
```

只想生成 service 文件，也可以使用：

```bash
deno task relay systemd \
  --workdir /opt/ai-trend-publish \
  --config /opt/ai-trend-publish/config/trendpublish.config.ts \
  --user trendpublish \
  --port 8080 | sudo tee /etc/systemd/system/trendpublish-weixin-relay.service
```

查看日志：

```bash
sudo journalctl -u trendpublish-weixin-relay -f
```

仓库也提供了可手工复制修改的模板：

```text
deploy/systemd/trendpublish-weixin-relay.service
```

如果 relay 通过域名暴露，建议在网关或反向代理上配置 HTTPS，然后把 Cloudflare 的
`WEIXIN_RELAY_URL` 设置成：

```text
https://relay.example.com
```

Cloudflare 使用：

```ts
providers: {
  publish: {
    weixinRelay: {
      url: runtime.required("WEIXIN_RELAY_URL"),
      token: runtime.required("WEIXIN_RELAY_TOKEN"),
    },
  },
},
features: {
  article: {
    publisher: { provider: "weixin-relay" },
  },
},
```

本地或 Docker 如果本身就部署在固定 IP 机器上，也可以继续使用
`publisher.provider: "weixin"` 直连微信。

最少需要在 Cloudflare 设置这三个 secret：

```bash
deno run -A npm:wrangler secret put WEIXIN_PUBLISH_PROVIDER # 填 weixin-relay
deno run -A npm:wrangler secret put WEIXIN_RELAY_URL        # 填 relay 地址
deno run -A npm:wrangler secret put WEIXIN_RELAY_TOKEN      # 填 relay token
```

设置后重新部署 Cloudflare：

```bash
deno task cf deploy
```

## 发布前检查

推荐顺序：

```bash
deno task verify
deno task doctor --config ./config/trendpublish.config.ts
deno task article --dry-run --config ./config/trendpublish.config.ts
```

正式发布前确认：

1. `features.article.dryRun` 已按预期设置。
2. 微信公众号后台已经配置服务器 IP 白名单。
3. 需要的抓取 provider、图片 provider、通知渠道只在功能开启时检查。
4. Docker 宿主机已经挂载 `./data/temp`，方便查看 dry-run 输出。
