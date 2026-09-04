export type ToolId =
  | 'home'
  | 'base64'
  | 'timestamp'
  | 'json-viewer'
  | 'json-diff'
  | 'escape'
  | 'compound'
  | 'crypto-market'
  | 'ahr999'
  | 'us-market';

type ToolCategoryId = 'development' | 'calculation' | 'market';

type Tool = {
  id: Exclude<ToolId, 'home'>;
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
  tools: tools.filter((tool) => tool.category === category.id),
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
