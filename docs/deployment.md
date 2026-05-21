# 部署与发布

## 应用部署（现有流程）

仓库已有应用部署工作流：

- `/.github/workflows/deploy.yml`

该流程目前仅支持手动触发，避免 release tag 自动覆盖生产环境。触发前需要确保目标
服务器上的 `trendpublish.config.ts` 已按生产环境配置好，再用 `pm2` 启动服务。

## 文档部署（GitHub Pages）

仓库已新增文档发布流程：

- `/.github/workflows/docs-pages.yml`

触发条件：

- 推送到 `main`，且变更包含 `docs/**` 或文档工作流文件
- 手动触发

流程概述：

1. 安装 Node 依赖（`npm ci`）
2. 构建 VitePress（`npm run docs:build`）
3. 上传 `docs/.vitepress/dist`
4. 部署到 GitHub Pages

## GitHub Pages 设置建议

在 GitHub 仓库设置中确认：

1. `Settings -> Pages -> Build and deployment` 使用 `GitHub Actions`
2. 默认分支为 `main`

## 本地验证

```bash
npm install
npm run docs:build
npm run docs:preview
```

## 回滚建议

- 文档异常：回滚文档相关提交，重新触发 `docs-pages`。
- 应用异常：回滚 Tag 或重新部署稳定版本。
