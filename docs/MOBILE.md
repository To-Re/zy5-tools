# 移动端适配与调试

同一套页面响应式适配，不另建手机版、不增加后端。PC 先用 Chrome 设备模式检查布局，再用手机验证真实输入、触摸和浏览器差异。

## 适配约定

- 首页直接按「开发工具」「计算工具」「行情」展示等宽工具卡片，不再放介绍和统计卡片；桌面侧栏与窄屏工具选择使用相同分类。各工具工作区的桌面布局保持不变，窄屏保留搜索，表单和结果按可用宽度重排，不整体缩小页面。
- 主要控件触摸高度至少 `44px`，输入字号至少 `16px`；操作不依赖鼠标悬停，允许页面缩放。
- 长金额、长标的和错误提示不能裁掉；diff 原文/新文逐行上下配对，代码与图表必要时局部滚动，图表通过滑块选择数据点，不能撑宽整页。
- 行情默认简洁模式；专业图表按需加载。第三方 iframe 是独立文档，宿主页 CSS 只能调整外框，不能改写其内部布局；跨域脚本访问也受同源策略限制。[同源策略](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)

## 滚动边界

- 窄屏（不超过 `860px`）或触摸设备（不超过 `1024px`）以页面纵向滚动为主。JSON 树、原文 Diff、字段差异取消阅读区高度上限；需要时仍可横向滚动，JSON 仍可折叠。桌面的阅读区限高保持不变。
- 币价、美股总览按自选数量展开，增删后同步高度。`lib/market-symbols.ts` 的 `getMarketOverviewContentHeight` 按每行 `60px` 加 `96px` 页签、边距和品牌空间计算，不是跨域 DOM 测量，也不隐藏或禁用内部滚动条。
- 行高来自 2026-09-04 读取的 TradingView Market Overview 公开样式 `.tv-widget-watch-list__row`；这是第三方实现细节，不是稳定 API。组件更新后，重新核对行高并验收 1 / 8 / 20 个自选、320 / 390px 宽和横屏；若仍出现内滚动，应修正尺寸，不设置 `pointer-events: none` 或遮罩拦截 iframe 手势。[官方嵌入配置](https://www.tradingview.com/widget-docs/widgets/watchlists/market-overview/)、[尺寸说明](https://www.tradingview.com/widget-docs/tutorials/set-widget-size/)
- 输入用 `textarea` 保留内部滚动，避免大文本把编辑操作撑到很远；专业行情图表保留自身平移和缩放。复利、九神图表只保留必要横向滚动与时间滑块。

## 在 PC 上模拟手机

在仓库根目录执行：

```bash
nvm use
npm ci
npm run dev
```

没有 `nvm` 的环境按 `.nvmrc` 安装对应 Node.js 版本，再执行 npm 命令。确保 Node.js 与依赖使用相同的系统架构，不混用 Apple Silicon 原生环境和 x64 仿真环境；已有正确依赖时无需重复 `npm ci`。

1. Chrome 打开终端显示的本地地址，通常是 `http://localhost:3000/`。
2. 打开开发者工具，再切换设备模式：

   | 操作 | Mac | Windows / Linux |
   | --- | --- | --- |
   | 打开开发者工具 | `⌘⌥I` | `F12` 或 `Ctrl+Shift+I` |
   | 切换设备模式 | `⌘⇧M` | `Ctrl+Shift+M` |

   快捷键以 [Chrome 官方说明](https://developer.chrome.com/docs/devtools/shortcuts)为准。

3. 选择 `Responsive`，依次检查 `320 × 568`、`360 × 800`、`390 × 844`、`430 × 932`，再交换宽高检查横屏。切换设备类型后刷新页面；最后关闭设备模式复查桌面。
4. 设备类型选择 `Mobile` 检查触摸；在 `Network` 中选择慢速网络或 `Offline` 检查加载与失败提示，完成后恢复正常网络。

设备模式可以模拟视口、触摸及网络/CPU 限速，但不是手机系统，也不会把 Chrome 变成 Safari。PC 键盘输入只适合检查焦点、Tab 顺序和提交；手机软键盘遮挡、地址栏伸缩、长按与文件选择仍须真机确认。[Chrome Device Mode](https://developer.chrome.com/docs/devtools/device-mode)

## 手机访问本地页面

手机与电脑连接同一个可信局域网。先停止原来的开发服务，再执行：

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

当前 Vinext 支持 `--hostname` / `-H`，不是 Vite 的 `--host`；升级依赖后可用 `npm run dev -- --help` 核对。

手机打开终端输出的 `Network` 地址，或 `http://<电脑局域网IP>:3000/`；手机上的 `localhost` 指的是手机自己。以终端实际端口为准。若打不开，检查电脑防火墙和 Wi-Fi 客户端隔离，不要直接关闭整个防火墙。

`0.0.0.0` 会监听所有网络接口，仅用于可信网络中的临时测试。不要做公网端口转发，也不要把开发服务通过隧道公开；测试后用 `Ctrl+C` 停止，只用虚构 JSON、金额和测试图片。

HTTP 局域网地址与本机 `localhost` 的安全上下文不同：复制按钮依赖的 Clipboard API 可能在前者不可用。最终需在受信任的 HTTPS 页面复测，不要为调试关闭浏览器安全限制。[安全上下文](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)、[Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)

## 在电脑上调试真机

- **Android + Chrome**：手机开启开发者选项与 USB 调试，USB 连接电脑并确认授权；电脑 Chrome 打开 `chrome://inspect/#devices`，启用 `Discover USB devices`，找到手机页面后点击 `Inspect`。不方便使用局域网时，可参考官方的 USB 端口转发流程。[Android 远程调试](https://developer.chrome.com/docs/devtools/remote-debugging)、[本地端口转发](https://developer.chrome.com/docs/devtools/remote-debugging/local-server)
- **iPhone + Mac**：iPhone 设置 → App → Safari → 高级 → Web 检查器（旧版本可能直接在设置 → Safari）；Mac Safari 设置 → 高级 → 启用网页开发者功能。USB 连接并在手机上信任电脑，手机 Safari 打开页面，再从 Mac Safari 的“开发 → 设备 → 页面”检查。[Apple iOS 调试](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios)、[WebKit 启用检查器](https://webkit.org/web-inspector/enabling-web-inspector/)
- 只信任自己的开发电脑；完成后关闭不再需要的 USB 调试/检查器。Windows 上的 Chrome 设备模式不能替代 iPhone Safari 真机验收。

## 最低验收清单

下面是待执行用例，不代表已经通过浏览器或真机测试。记录视口、浏览器版本、步骤、实际结果与截图；状态使用 `PASS`、`FAIL` 或 `BLOCKED`，阻塞必须写明原因。

| 用例 | 步骤与预期 |
| --- | --- |
| 导航与布局 | 四种窄屏、横屏与桌面切换工具、刷新 Hash 路由；首页、侧栏和工具选择分类一致，9 个工具无遗漏或重复；搜索仅显示匹配分类，入口可操作，整页无横向溢出 |
| 滚动边界 | 手机在 1 / 8 / 20 个自选的列表上纵向滑动应滚动页面；JSON / Diff 阅读结果无固定高度内滚动，长内容不被裁掉；桌面阅读区、文本编辑与图表操作保持正常 |
| 复利 | 输入长金额、增删现金流计划并操作滑块；数字完整、按钮不重叠，软键盘关闭后布局恢复 |
| JSON / diff | 测试深层 JSON、长字符串、非法草稿；展开/收起可触摸，差异能阅读，局部可滚动 |
| 行情 | 搜索、加入、删除和调整自选顺序；简洁模式不加载蜡烛图，专业模式能返回简洁模式 |
| 缓存与错误 | 刷新确认草稿/偏好保留；已加载页面切换断网检查行情错误或已有缓存提示，不要求离线首次打开 |
| 系统能力 | 真机 HTTPS 检查复制、粘贴、图片选择和下载；拒绝权限时有可理解提示 |

PC、手机、不同浏览器，以及 `localhost`、局域网 IP、线上域名的缓存互不共享；测试时不要把“手机没有 PC 自选”误判为缓存失效。
