# 工资与养老：提交范围与发布验收

日期：2026-10-12。规则版本：`2026-10-12.1`。本地基线：`63fe2d1`。

**开发与本地验收完成；用户已批准本清单的76个站点文件与1份运维笔记提交、部署。** 以下为发布前验收快照，实际生产回执在发布后补充。用户反馈的页面文字过多、输入和结论不清晰已通过任务式改版处理；三个独立UX视角及独立法规/数值审核均无未解决P1/P2。旧浏览器通过结论不能替代本次复验。

本版是证据支持下的有限计算工具，完整支持矩阵见 [LABOR.md](LABOR.md)。北京、上海、浙江含温州提供受限的养老缴费单项和普通关系省级判断；北京、浙江养老金总额仍禁用，不能称作三地完整待遇计算器。

## 主要交付

- 八个按问题选择的任务；一次只展示一张相关表单，主结论与错误自动定位，计算明细和完整规则渐进展开。每项结果仍有直接官方原文链接。
- 到手工资和单位成本分别使用独立接口：到手不要求单位资料，单位成本不要求个人个税背景。年度汇算与累计预扣分离。
- 退休条件或领取省经历变更会使相关旧结果和确认失效。养老金虚构示例保留跨省草稿并明确脱钩；重新关联时清空金额及确认，恢复本人地区与退休限制。
- 工资示例从任务选择到主结论为2次点击、0次滚动；320/390手机、键盘、错误、重置、重复操作、返回与刷新已独立复验。

## 可复核证据

- 最终 `npm run verify`：141项测试全部通过，ESLint、TypeScript、Vinext兼容检查及纯静态构建通过。日志 `/tmp/zy5-labor-release-review-verify.log`。
- `npm run deploy:dry-run`：26个静态文件、无运行时bindings，只预演，没有发布。日志 `/tmp/zy5-labor-release-review-dry-run.log`。
- [独立法规与数值审核](labor-independent-audit.md)：30组独立测试通过；手算金值、关系先后、边界、拒算、来源和跨任务语义复验。
- [工资新手任务](labor-ux-salary.md)、[跨省新手任务](labor-ux-province.md)、[手机与键盘审核](labor-ux-accessibility.md)：以各报告顶部/末尾最新结论为准，历史发现和截图保留用于追踪修复。
- [早期浏览器记录](labor-browser-audit.md)保留历史功能证据，其旧可发布结论已经撤回。三个UX审阅是AI模拟审阅，不是真人实验，也不是完整WCAG认证。

残余P3：错误字段尚无直接跳转/aria-invalid；极窄屏顶部工具名略截断；初次加载有短暂首页、刷新滚动位置可能保留；部分反推术语和重置后定位仍可改进。这些未被当前审阅者判为P1/P2，但未声称完美可用。

## 建议本次代码提交范围

下列均为本任务修改或新增；提交时应以最终工作树为准，不能直接提交暂存区中较早的实现快照。

```text
README.md
components/labor-tool.module.css
components/labor-tool.tsx
components/toolbox-app.tsx
docs/ARCHITECTURE.md
docs/LABOR-REVIEW.md
docs/LABOR.md
docs/MOBILE.md
docs/labor-audit/desktop-beijing-blocked-reason.png
docs/labor-audit/desktop-cross-province.png
docs/labor-audit/desktop-payroll-results.png
docs/labor-audit/desktop-payroll.png
docs/labor-audit/desktop-pension-results.png
docs/labor-audit/mobile-contribution-320.png
docs/labor-audit/mobile-cross-province-320.png
docs/labor-audit/mobile-rule-320.png
docs/labor-audit/ux-a11y-after-desktop-result.png
docs/labor-audit/ux-a11y-after-desktop-tasks.png
docs/labor-audit/ux-a11y-after-final-mobile320-result.png
docs/labor-audit/ux-a11y-after-final-mobile390-result.png
docs/labor-audit/ux-a11y-after-mobile320-result.png
docs/labor-audit/ux-a11y-after-mobile320-tasks.png
docs/labor-audit/ux-a11y-after-mobile390-result.png
docs/labor-audit/ux-a11y-before-desktop.png
docs/labor-audit/ux-a11y-before-mobile320-pension.png
docs/labor-audit/ux-a11y-before-mobile320.png
docs/labor-audit/ux-a11y-before-mobile390.png
docs/labor-audit/ux-province-after-beijing.png
docs/labor-audit/ux-province-after-blocked.png
docs/labor-audit/ux-province-after-checklist.png
docs/labor-audit/ux-province-after-example-cleared.png
docs/labor-audit/ux-province-after-example.png
docs/labor-audit/ux-province-after-reset-fixed.png
docs/labor-audit/ux-province-after-result.png
docs/labor-audit/ux-province-after-retirement.png
docs/labor-audit/ux-province-after-stale-date-fixed.png
docs/labor-audit/ux-province-after-stale-date.png
docs/labor-audit/ux-province-after-stale.png
docs/labor-audit/ux-province-before-form.png
docs/labor-audit/ux-province-before-result.png
docs/labor-audit/ux-province-final-independent.png
docs/labor-audit/ux-province-final-relinked-beijing.png
docs/labor-audit/ux-salary-after-cost-detail.png
docs/labor-audit/ux-salary-after-edit-cleared.png
docs/labor-audit/ux-salary-after-primary.png
docs/labor-audit/ux-salary-after-unit-blocker.png
docs/labor-audit/ux-salary-before-results.png
docs/labor-audit/ux-salary-final-18000.png
docs/labor-audit/ux-salary-final-cost.png
docs/labor-audit/ux-salary-final-example.png
docs/labor-audit/ux-salary-final-inverse.png
docs/labor-audit/ux-salary-final-route.png
docs/labor-browser-audit.md
docs/labor-independent-audit.md
docs/labor-research-beijing-pension.md
docs/labor-research-beijing.md
docs/labor-research-guangdong.md
docs/labor-research-shanghai.md
docs/labor-research-transfer.md
docs/labor-research-zhejiang.md
docs/labor-ux-accessibility.md
docs/labor-ux-province.md
docs/labor-ux-salary.md
lib/labor-benefit-province.ts
lib/labor-contribution-item.ts
lib/labor-engine.ts
lib/labor-ledger.ts
lib/labor-rules.ts
lib/tool-catalog.ts
tests/labor-benefit-province.test.ts
tests/labor-employer-cost.test.ts
tests/labor-engine.test.ts
tests/labor-independent.test.ts
tests/labor-ledger.test.ts
tests/labor-take-home.test.ts
tests/tool-catalog.test.ts
```

共76个文件：实现与入口9个、测试7个、文档16个、验收截图44个。截图为页面及虚构输入；旧截图是审计历史，不代表最终界面。
未修改依赖锁文件、部署配置、账户、凭据、后端或域名配置；既有工具另仅涉及共用hash路由同步修正，已经复验冷开、刷新、返回及其他工具切换。

## 独立知识库范围

另一个仓库仅涉及 `01 项目/个人工具站/个人工具站运维.md`，记录开发验收、支持边界及未发布状态。其余知识库改动和暂存内容均不属于本任务，不应一并提交。公开应用仓库未复制私人笔记或用户资料。

## 必须继续保留的边界

北京、浙江养老金总额/逆算/累计禁用；完整五险一金自动包禁用；临时账户、视同、特殊转移、跨制度权益混算和温州市级经办地判断禁用。上海金额只在已核人群、固定2026参数、表内整周岁下提供情景。缴费预算不等于权益，不能把各省养老金相加，累计领取窗口不是法定截止或计发月数。

薪酬、出生月、账户及经历只保存在浏览器内存，不上传、不持久化；官方链接不带输入。显示AI辅助制作、仅供参考、自行复核原文及以主管部门核定为准。

## 用户决定提交后的步骤

按既有流程提交经过验收的最终源码，再执行已获授权的 `npm run deploy`；回读Worker新版本与流量，核对线上产物、真实页面和来源链接，再更新运维记录。当前生产仍为源码 `63fe2d1` / Worker Version `d6ca9467-a1c6-4786-927f-bd84ccf3108e`，没有新部署回执。Git提交不等于GitHub推送，本轮未推送。
