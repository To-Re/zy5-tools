# 架构说明

ZY5 Tools 是一个 local-first 的单页工具箱。除行情组件外，输入和计算都停留在浏览器内；当前没有自建 API、数据库、账号系统或服务端密钥。

## 运行结构

```text
浏览器
├─ Hash 路由与工具导航
├─ 本地工具组件
│  └─ lib/ 中的纯计算与转换函数
├─ localStorage
│  ├─ 主题
│  ├─ 复利参数与 JSON 草稿
│  ├─ 币价、美股自选及顺序
│  └─ AHR999 最近计算结果
├─ 行情 iframe
│  └─ 浏览器直接请求 TradingView
└─ AHR999
   └─ 浏览器请求 Binance 已收盘 BTCUSDT 日线并本地计算
```

应用由 Vinext 静态导出为 `dist/client/`，Cloudflare Workers Static Assets 直接分发这些文件，没有 Worker 脚本入口。所有工具共用根页面，使用 URL Hash 切换，例如 `/#compound`、`/#json-diff`。

## 目录职责

| 目录或文件 | 职责 |
| --- | --- |
| `app/layout.tsx` | 页面元信息、语言和全局样式入口 |
| `app/page.tsx` | 根页面入口 |
| `components/toolbox-app.tsx` | 工具界面、导航、Hash 路由和主题 |
| `lib/tool-catalog.ts` | 工具注册、统一分类与搜索过滤 |
| `components/*-tool.tsx` | 各工具交互界面 |
| `lib/*.ts` | 可独立测试的转换、比较和计算逻辑 |
| `tests/*.test.ts` | Node 原生测试 |
| `public/` | favicon、分享预览图和静态资源响应头 |
| `next.config.ts` | 启用纯静态导出与目录式 URL |
| `vite.config.ts` | Vinext 构建配置 |
| `deploy/wrangler.jsonc` | Static Assets、自定义域与部署配置 |

## 数据边界

### 本地处理

- 图片 Base64、时间戳、JSON、转义、复利和 AHR999 计算均在当前页面执行。
- 复利参数和 JSON 阅读器草稿会自动保存在当前浏览器；其他本地工具输入刷新后消失。
- 主题保存在 `zy5-tools-theme`。
- 复利与 JSON 缓存分别保存在 `zy5-tools-compound-v1` 和 `zy5-tools-json-viewer-v1`。
- 行情自选分别保存在 `zy5-tools-watchlist-v2:crypto` 和 `zy5-tools-watchlist-v2:us`；首次读取旧版时会做一次兼容迁移。
- AHR999 最近计算结果保存在 `zy5-tools-ahr999-v1`，用于降低刷新频率和在短时网络故障时保留上次结果。

`localStorage` 以“浏览器 profile + origin”为边界。localhost、`tools.zy5.dev`、不同浏览器 profile 或隐私窗口之间不会自动同步。

### 第三方请求

币价和美股通过 iframe 直接加载 TradingView。本站不代理行情，也不保存行情 API Key。TradingView 会收到浏览器请求、所选 symbol 与自选列表，并可能按其策略使用第三方 Cookie。广告拦截器、公司网络策略、第三方故障或交易所维护都可能导致行情空白或暂停更新。

九神指数页直接请求 Binance 公开 BTCUSDT 日线，只采用已收盘 UTC 日线。浏览器按经典固定参数计算 AHR999，并缓存最近结果 15 分钟；Binance 会收到浏览器请求和网络地址。

## 当前能力边界

- 无 Worker 脚本、自建后端、D1、R2、KV 和 Durable Objects。
- 无账号体系，因此不支持跨设备同步。
- 美股免费行情可能延迟，只用于查看。
- 币种搜索默认把未带交易所的代码映射到 Binance USDT 交易对；固定自选可指定其他交易所。
- AHR999 使用经典固定参数和 200 日几何成本，不与采用算术均线、其他价格源或动态重拟合的平台保证数值一致。
- 页面工具由客户端 Hash 路由承载，不依赖服务端路径重写。

## 扩展原则

- 计算与转换逻辑优先放在 `lib/`，组件只负责交互和展示。
- 新工具应加入统一注册表，而不是创建第二套导航。
- 新增非行情第三方工具时，应把数据边界和提供方作为独立元数据，不能继续只用工具分组推断隐私提示。
- 会上传数据、需要密钥或持久化的功能必须先重新评估隐私边界。
- 只有跨设备状态、服务端代理或用户账号成为明确需求时，才考虑 D1、R2 或鉴权。
