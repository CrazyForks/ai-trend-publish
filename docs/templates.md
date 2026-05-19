# 模板展示

TrendPublish 提供了多种可用于内容发布的模板。

## 微信文章模板

| 模板名 | 预览 | 说明 |
| --- | --- | --- |
| default | ![default](https://oss.liuyaowen.cn/images/weixin-template-default.png) | 微信原生正式风，适合通用 AI 资讯与日常发布 |
| modern | ![modern](https://oss.liuyaowen.cn/images/weixin-template-modern.png) | 蓝青科技资讯风，适合趋势速览与产品技术动态 |
| tech | ![tech](https://oss.liuyaowen.cn/images/weixin-template-tech.png) | 工程技术专栏风，适合技术解读与开发实践 |
| mianpro | ![mianpro](https://oss.liuyaowen.cn/images/weixin-template-mianpro.png) | AI 日报风，适合每日精选、简报和连续栏目 |
| longform | ![longform](https://oss.liuyaowen.cn/images/weixin-template-longform.png) | 杂志长文风，适合观察、评论与专题综述 |
| product | ![product](https://oss.liuyaowen.cn/images/weixin-template-product.png) | 更新日志风，适合工具更新、版本亮点与产品公告 |
| minimal | ![minimal](https://oss.liuyaowen.cn/images/weixin-template-minimal.png) | 极简阅读风，适合正式、克制、内容优先的发布 |
| darktech | ![darktech](https://oss.liuyaowen.cn/images/weixin-template-darktech.png) | 深色研究笔记风，适合高信息密度的技术摘要 |

通过 `ARTICLE_TEMPLATE_TYPE` 选择微信文章模板：

```bash
ARTICLE_TEMPLATE_TYPE="minimal"
```

可选值：`default`、`modern`、`tech`、`mianpro`、`longform`、`product`、`minimal`、`darktech`、`random`。

本地预览命令：

```bash
deno test -A --no-check src/modules/render/weixin/test/test.weixin.template.ts
```

预览文件会输出到 `src/temp/preview_weixin_*.html`。

## 热门仓库模板

| 模板名 | 预览 | 说明 |
| --- | --- | --- |
| github-ai | ![github-ai](https://oss.liuyaowen.cn/images/202503081200433.png) | GitHub 热门 AI 仓库展示模板 |
