# 部署与运维

## 服务档案

| 项目 | 当前约定 |
| --- | --- |
| 正式域名 | `https://tools.zy5.dev` |
| Canonical host | `tools.zy5.dev` |
| 访问边界 | 公开 |
| 托管 | Cloudflare Workers Static Assets |
| Worker 名 | `zy5-tools` |
| 部署配置 | `deploy/wrangler.jsonc` |
| 静态产物 | `dist/client/` |
| Worker 脚本 | 无 |
| 自建后端 | 无 |
| 持久化 | 浏览器 `localStorage` |
| 外部数据 | TradingView iframe、Binance 公开日线 |
| Node.js | `22.22.0` 或 `>=24` |

项目使用 Vinext `output: "export"` 生成纯静态文件。`tool.zy5.dev` 不作为第二个正式入口；如果以后创建，只允许重定向到 `tools.zy5.dev`。

## 首次准备

1. 安装 `.nvmrc` 指定的 Node.js 和锁文件依赖。
2. 执行 `npx wrangler login`，只通过 Cloudflare 官方 OAuth 授权；不要把 Token 写入仓库或知识库。
3. 确认 Cloudflare 账号下没有同名且用途不明的 Worker。
4. 确认 `deploy/wrangler.jsonc` 中的 Worker 名、正式域名和静态目录准确。

```bash
nvm use
npm ci
npx wrangler whoami
```

## 发布前检查

1. 确认工作区只有本次变更，没有凭据、`.env` 或生成目录。
2. 完成单测、Lint、类型检查、Vinext 兼容检查和静态导出。
3. 确认 `dist/client/index.html`、`404.html`、favicon 和分享图存在。
4. 用 Wrangler dry-run 确认部署只有 Static Assets，输出中没有运行时 bindings。
5. 提交经过验证的源码，记录 commit 与变更摘要。

```bash
nvm use
npm ci
npm run verify
npm run deploy:dry-run
git diff --check
```

`npm run build` 的输出必须包含 `Pre-rendering all routes (output: 'export')`。如果退化成服务端构建，先停止发布并检查 `next.config.ts` 与 `vite.config.ts`。

## 发布流程

普通版本更新：

1. 完成发布前检查并提交代码。
2. 执行 `npm run deploy`；该命令会重新完整验证，再由 Wrangler 上传 `dist/client/`。
3. 记录 Wrangler 返回的 Version ID，不在公开文档中保存账号或授权信息。
4. 回读 Worker deployment、自定义域、DNS、TLS 和真实页面。
5. 检查首页、哈希工具入口、指纹资源缓存和第三方行情。

```bash
npm run deploy
npx wrangler deployments list --config deploy/wrangler.jsonc
```

首次从其他托管迁移时，先在不带 `routes` 的配置下部署并验收 `workers.dev` 预览。确认产物正常后，再处理正式域名：

1. fresh 回读旧托管的自定义域和 `tools.zy5.dev` DNS。
2. 解除旧托管的自定义域，只删除该子域的旧 CNAME 和专属验证 TXT。
3. 在 `deploy/wrangler.jsonc` 增加 `custom_domain` route 并立即重新部署。
4. 回读 Workers Custom Domain 必须指向 `zy5-tools`，DNS 链不得再出现旧托管域名。

不要手工创建指向 `workers.dev` 的 CNAME。Workers Custom Domain 会自动管理兼容的 DNS 记录与证书。

## 线上验收

| 层级 | 检查项 | 通过标准 |
| --- | --- | --- |
| 控制面 | Worker deployment | 最新版本承载 100% 流量 |
| 自定义域 | `tools.zy5.dev` | 绑定 `zy5-tools` 且 enabled |
| DNS | 权威、阿里、腾讯公共 DNS | 有效解析，链路不含 `chatgpt.site` |
| TLS | HTTPS | 证书有效，无重定向循环 |
| HTTP | `/` 与不存在路径 | 首页 `200`，不存在路径 `404` |
| 静态资源 | `/_next/static/*` | `200`，带一年 immutable 浏览器缓存 |
| 本地工具 | Base64、时间戳、JSON、转义、复利 | 输入只在浏览器处理，关键操作正常 |
| 本地缓存 | 复利、JSON 阅读器 | 切换工具与刷新后恢复；重置后不恢复旧值 |
| 行情 | 币价、美股 | TradingView 能加载；异常时有来源与风险提示 |
| 九神指数 | AHR999 | Binance 已收盘日线可加载；失败时保留本机缓存 |
| 自选 | 搜索、添加、删除、排序、刷新 | 同一浏览器与域名下保持 |
| 响应式 | 桌面与窄屏 | 无白屏、遮挡或横向溢出 |
| 中国大陆 | 至少一个真实大陆网络 | 页面和指纹资源可访问；单独记录第三方行情可用性 |

Cloudflare Free 的全球网络不能作为中国大陆稳定性或 SLA 保证。Static Assets 能消除 `chatgpt.site` 依赖，但若稳定大陆访问是硬指标，应另行评估大陆托管、ICP 备案或 Cloudflare China Network。

## 缓存

- HTML、favicon 和分享图采用 Cloudflare 默认重验证策略，发布后不会长期停留在旧版本。
- `/_next/static/*` 文件名包含内容哈希，`public/_headers` 将其设为一年 `immutable`。
- 不给 `index.html` 设置长期缓存，否则新版本可能无法及时生效。

## 回滚

### 普通 Worker 版本回滚

1. 用 deployments 列表找到上一个已验收 Version ID。
2. 确认目标版本和故障时间，不修改 DNS 或自定义域。
3. 执行 Wrangler rollback，并写明原因。
4. 回读流量已切到目标版本，再重跑线上验收。

```bash
npx wrangler deployments list --config deploy/wrangler.jsonc
npx wrangler rollback <version-id> --config deploy/wrangler.jsonc --message "rollback reason"
```

### 首次托管迁移回滚

首次从其他托管切换时，旧 Worker 版本回滚不能恢复旧托管。切换前必须在临时、受控的变更记录中保存旧自定义域绑定、CNAME、验证 TXT 与 TTL；不要把验证值写入 Git 或知识库。

如果新 Custom Domain、证书或页面持续失败：

1. fresh 回读并解除 `tools.zy5.dev` 的 Worker Custom Domain，只处理这个精确 hostname。
2. 将 `tools.zy5.dev` 重新绑定到原 Sites 项目和已验收版本。
3. 以 Sites 本次返回的 CNAME 与验证记录为准，恢复 DNS；若新返回值与迁移前不同，禁止复用旧值。
4. 回读 Sites domain、DNS、TLS 和首页，全部恢复后才结束回滚。
5. 保留新 Worker 及其版本用于排查，不删除项目；修复后重新走完整迁移流程。

如果故障只来自 TradingView 或 Binance，不回滚仍正常的静态站；先确认第三方状态、地区策略、网络限制和浏览器拦截。

## 常见故障

### `1016 Origin DNS error`

- 先回读 Workers Custom Domain 是否 enabled，不能只看 DNS 页面。
- 检查同名旧 CNAME 是否仍存在；Custom Domain 与旧 CNAME 不能并存。
- 刚切换时分别检查权威 DNS、公共递归 DNS 和真实访问，区分传播窗口与配置错误。
- 若控制面、证书或多个入口仍失败，按切换前保存的状态回滚，不反复删除重建无关 DNS。

### 页面白屏或静态资源失败

- 回读最新 Worker deployment 和正式域名 HTTP 状态。
- 确认发布 commit 与本地静态产物来自同一次构建。
- 检查 HTML 引用的 JS/CSS 是否 `200`，再看浏览器 Console。
- 必要时回滚到上一个已验收版本。

### Hash 工具入口异常

- 直接访问根页面，再检查 `#compound`、`#json-diff` 等 Hash。
- Hash 不会发给服务端，不应为每个工具配置独立路由。

### 行情空白

- 检查 TradingView、Binance、广告拦截器、公司网络策略和地区限制。
- 确认简洁模式本来就不会加载蜡烛图；价格总览仍应存在。
- 站点可访问不代表第三方行情源在同一网络可访问。

### 自选消失

- 确认是否更换浏览器、设备、隐私窗口或域名。
- 检查 `localStorage` 是否被清理。
- localhost 的自选不会迁移到 `tools.zy5.dev`，这不是服务端数据丢失。

## 托管边界

- 正式生产优先使用自有 Cloudflare Workers Static Assets 和自有 Custom Domain。
- ChatGPT Sites 可用于临时 Demo，但不作为需要中国大陆访问的正式托管链路。
- 项目不保留 `.openai/hosting.json` 或 Sites 构建插件，防止误走旧部署路径。
- 新增服务端接口、密钥、数据库或用户体系时，必须重新评估架构和免费额度。
