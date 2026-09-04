# ZY5 Tools

一个 local-first 的个人开发工具箱。图片、文本与计算参数默认只在浏览器中处理，不上传到服务端。

正式地址：[https://tools.zy5.dev](https://tools.zy5.dev)

## 当前工具

- 图片 Base64 编码 / 解码
- Unix 时间戳与本地、UTC、ISO 时间互转
- JSON 格式化、压缩与结构概览，自动缓存当前草稿
- JSON 语义 Diff
- JSON、URL、HTML、Unicode 转义 / 反转义
- 支持多段投入 / 拿走现金流计划、价值曲线与参数缓存的复利计算器
- 币价：默认简洁价格列表，支持搜索、自选排序、浏览器本地保存与按需展开图表
- 美股 / ETF：默认简洁价格列表，支持搜索、自选排序、浏览器本地保存与按需展开图表
- 九神指数：浏览器直连 Binance 日线，计算并展示经典 AHR999 历史曲线

数据工具默认只在浏览器本地运行。复利参数、JSON 草稿、行情自选和 AHR999 最近数据保存在当前浏览器。行情页会直接访问 TradingView 或 Binance；本站不持有行情 API Key，也不经过自建后端。

## 本地开发

推荐使用 Node.js 22 LTS（仓库内 `.nvmrc` 固定为 `22.22.0`）。Node.js 23 不在部分构建依赖的支持范围内。

```bash
npm ci
npm run dev
```

默认访问 `http://localhost:3000/`。

当前版本不需要环境变量；`.env.example` 用于明确这一边界。

构建并使用 Cloudflare Static Assets 的本地运行方式预览：

```bash
npm run preview
```

## 验证

```bash
npm test
npm run lint
npm run typecheck
npm run check
npm run build
```

## 文档

- [架构说明](docs/ARCHITECTURE.md)
- [二次开发](docs/DEVELOPMENT.md)
- [部署与运维](docs/OPERATIONS.md)

## 部署边界

项目通过 Vinext `output: "export"` 生成纯静态文件，再由 Cloudflare Workers Static Assets 托管，正式域名为 `tools.zy5.dev`。部署中没有 Worker 脚本入口，也不使用 ChatGPT Sites、自建后端、D1、R2 或服务端密钥。

```bash
npm run deploy:dry-run
npm run deploy
```

Cloudflare 配置真源是 `deploy/wrangler.jsonc`；完整发布、验收与回滚流程见 `docs/OPERATIONS.md`。知识库只记录项目入口与运维信息，不存放源码。
