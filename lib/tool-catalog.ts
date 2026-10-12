export const LABOR_TOOL_IDS = ['labor', 'labor-cost', 'salary-net', 'retirement-pension', 'annual-tax', 'retirement-date', 'benefit-province', 'pension-contribution', 'housing-fund', 'flexible-contributions', 'pension-component', 'contribution-budget'] as const;
export type LaborToolId = typeof LABOR_TOOL_IDS[number];

export type ToolId =
  | 'home'
  | 'base64'
  | 'timestamp'
  | 'json-viewer'
  | 'json-diff'
  | 'escape'
  | 'compound'
  | LaborToolId
  | 'crypto-market'
  | 'ahr999'
  | 'us-market';

type ToolCategoryId = 'development' | 'calculation' | 'market';

type Tool = {
  id: Exclude<ToolId, 'home' | 'labor'>;
  secondary?: boolean;
  name: string;
  description: string;
  glyph: string;
  category: ToolCategoryId;
  group: string;
  keywords?: readonly string[];
  kind: 'local' | 'market';
  status: string;
  ready: boolean;
};

export const tools: Tool[] = [
  { id: "labor-cost", secondary: true, name: "用工成本", description: "城市＋月薪，查看已核验单位缴费。", glyph: "¥", category: 'calculation', group: '工资社保养老', keywords: ["公司成本", "企业成本", "税前", "五险一金"], kind: 'local', status: '本地', ready: true },
  { id: "salary-net", name: "工资测算", description: "个人收入、五险一金与公司支出，同页比较。", glyph: "到", category: 'calculation', group: '工资社保养老', keywords: ["税前", "税后", "工资", "个税", "反推", "公司成本", "企业成本", "公积金", "三险"], kind: 'local', status: '本地', ready: true },
  { id: "retirement-pension", name: "社保退休金测算", description: "缴费时间线、退休结果与目标养老金方案。", glyph: "领", category: 'calculation', group: '工资社保养老', keywords: ["养老金", "退休", "上海", "北京", "浙江"], kind: 'local', status: '本地', ready: true },
  { id: "annual-tax", name: "年度个税汇算", description: "核对全年综合所得补退税。", glyph: "年", category: 'calculation', group: '工资社保养老', keywords: ["个税", "年度", "汇算"], kind: 'local', status: '本地', ready: true, secondary: true },
  { id: "retirement-date", name: "退休日期", description: "核对退休日期及最低缴费年限。", glyph: "日", category: 'calculation', group: '工资社保养老', keywords: ["退休", "延退", "年龄"], kind: 'local', status: '本地', ready: true, secondary: true },
  { id: "benefit-province", name: "养老金领取省份", description: "按已核定跨省经历判断领取省。", glyph: "省", category: 'calculation', group: '工资社保养老', keywords: ["养老金", "跨省", "领取地"], kind: 'local', status: '本地', ready: true, secondary: true },
  { id: "pension-contribution", name: "养老缴费单项", description: "按已核定基数计算养老缴费。", glyph: "缴", category: 'calculation', group: '工资社保养老', keywords: ["养老", "社保", "灵活就业"], kind: 'local', status: '本地', ready: true, secondary: true },
  { id: "housing-fund", name: "公积金月额", description: "北京企业、温州限定人群单项计算。", glyph: "房", category: 'calculation', group: '工资社保养老', keywords: ["住房", "公积金", "温州"], kind: 'local', status: '本地', ready: true, secondary: true },
  { id: "flexible-contributions", name: "北京个人三险", description: "仅通知规定个人参保渠道。", glyph: "险", category: 'calculation', group: '工资社保养老', keywords: ["北京", "个人参保", "灵活就业", "三险"], kind: 'local', status: '本地', ready: true, secondary: true },
  { id: "pension-component", name: "养老金分项复核", description: "京浙经办核定单项，非总额。", glyph: "核", category: 'calculation', group: '工资社保养老', keywords: ["养老金", "北京", "浙江", "核定"], kind: 'local', status: '本地', ready: true, secondary: true },
  { id: "contribution-budget", name: "分段缴费预算", description: "按自填月额累计支出，不认定权益。", glyph: "段", category: 'calculation', group: '工资社保养老', keywords: ["社保", "预算", "分段"], kind: 'local', status: '本地', ready: true, secondary: true },
  {
    id: 'compound',
    name: '复利计算器',
    description: '复利 · 现金流计划 · 价值曲线',
    glyph: '%',
    category: 'calculation',
    group: '财务计算',
    kind: 'local',
    status: '本地',
    ready: true,
  },
  {
    id: 'base64',
    name: '图片 Base64',
    description: '图片 ⇄ Base64 / Data URL',
    glyph: '64',
    category: 'development',
    group: '编码转换',
    kind: 'local',
    status: '本地',
    ready: true,
  },
  {
    id: 'timestamp',
    name: '时间戳',
    description: 'Unix ⇄ 本地时间 / UTC / ISO',
    glyph: 'T',
    category: 'development',
    group: '时间日期',
    kind: 'local',
    status: '本地',
    ready: true,
  },
  {
    id: 'json-viewer',
    name: 'JSON 阅读器',
    description: '格式化 · 压缩 · 结构统计',
    glyph: '{}',
    category: 'development',
    group: '数据处理',
    kind: 'local',
    status: '本地',
    ready: true,
  },
  {
    id: 'json-diff',
    name: 'JSON Diff',
    description: '语义比较 · 字段路径',
    glyph: '±',
    category: 'development',
    group: '数据处理',
    kind: 'local',
    status: '本地',
    ready: true,
  },
  {
    id: 'escape',
    name: '转义 / 反转义',
    description: 'JSON · URL · HTML · Unicode',
    glyph: '\\',
    category: 'development',
    group: '编码转换',
    kind: 'local',
    status: '本地',
    ready: true,
  },
  {
    id: 'crypto-market',
    name: '币价',
    description: '自选价格 · 搜索添加 · 按需图表',
    glyph: '₿',
    category: 'market',
    group: '行情 加密货币 Crypto USDT',
    keywords: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'BGBUSDT', 'OKBUSDT', 'ASTERUSDT', 'USDCUSDT', 'PENDLEUSDT', '币价'],
    kind: 'market',
    status: '实时',
    ready: true,
  },
  {
    id: 'ahr999',
    name: '九神指数',
    description: 'AHR999 · 估值区间 · 历史曲线',
    glyph: '9',
    category: 'market',
    group: '行情 加密货币 比特币 BTC 指标',
    keywords: ['AHR999', '九神', '酒神', '定投', '抄底'],
    kind: 'market',
    status: '每日',
    ready: true,
  },
  {
    id: 'us-market',
    name: '美股 / ETF',
    description: '自选价格 · 搜索添加 · 按需图表',
    glyph: '$',
    category: 'market',
    group: '行情 美股 股票 ETF US',
    keywords: ['AAPL', 'APPL', '苹果', 'AEHR', 'MRVL', 'MP', 'FSLR', 'MPFSLR', 'LMT', 'NOC', 'VOO', 'QQQ'],
    kind: 'market',
    status: '延迟',
    ready: true,
  },
];

const categories: Array<{ id: ToolCategoryId; name: string }> = [
  { id: 'development', name: '开发工具' },
  { id: 'calculation', name: '计算工具' },
  { id: 'market', name: '行情' },
];

// 首页、桌面导航和手机选择器共用分类，新增工具只需登记一次。
export const toolCategories = categories.map((category) => ({
  ...category,
  tools: tools.filter((tool) => tool.category === category.id && !tool.secondary),
}));

export function filterToolCategories(search: string) {
  const query = search.trim().toLowerCase();
  return toolCategories.map((category) => ({
    ...category,
    tools: category.tools.filter((tool) =>
      `${category.name} ${tool.name} ${tool.description} ${tool.group} ${tool.keywords?.join(' ') ?? ''}`.toLowerCase().includes(query),
    ),
  })).filter((category) => category.tools.length > 0);
}

/** Keep legacy bookmarks accessible without publishing separate navigation entries. */
export function resolveToolHash(hash: string): ToolId {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (value === 'labor') return 'labor';
  return tools.find((tool) => tool.id === value && tool.ready)?.id ?? 'home';
}

export function isLaborToolId(id: ToolId): id is LaborToolId {
  return (LABOR_TOOL_IDS as readonly string[]).includes(id);
}
