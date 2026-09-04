export type MarketKind = 'crypto' | 'us';
export type MarketTheme = 'light' | 'dark';

export interface MarketSymbol {
  symbol: string;
  code: string;
  name: string;
}

export interface MarketProfile {
  title: string;
  eyebrow: string;
  description: string;
  dataLabel: string;
  dataTone: 'live' | 'delayed';
  dataNote: string;
  searchPlaceholder: string;
  symbols: readonly MarketSymbol[];
}

export const MARKET_PROFILES: Readonly<Record<MarketKind, MarketProfile>> = {
  crypto: {
    title: '币价',
    eyebrow: '行情 / Crypto',
    description: '8 个 USDT 交易对一屏查看；点击代码切图，也可查询其他交易对。',
    dataLabel: '交易所实时行情',
    dataTone: 'live',
    dataNote: '数据由 TradingView 接入对应交易所；交易所维护或网络异常时可能暂停更新。',
    searchPlaceholder: '输入交易对，如 BTCUSDT',
    symbols: [
      { symbol: 'BINANCE:BTCUSDT', code: 'BTCUSDT', name: 'Bitcoin / USDT' },
      { symbol: 'BINANCE:ETHUSDT', code: 'ETHUSDT', name: 'Ethereum / USDT' },
      { symbol: 'BINANCE:BNBUSDT', code: 'BNBUSDT', name: 'BNB / USDT' },
      { symbol: 'BITGET:BGBUSDT', code: 'BGBUSDT', name: 'Bitget Token / USDT' },
      { symbol: 'OKX:OKBUSDT', code: 'OKBUSDT', name: 'OKB / USDT' },
      { symbol: 'BINANCE:ASTERUSDT', code: 'ASTERUSDT', name: 'Aster / USDT' },
      { symbol: 'BINANCE:USDCUSDT', code: 'USDCUSDT', name: 'USDC / USDT' },
      { symbol: 'BINANCE:PENDLEUSDT', code: 'PENDLEUSDT', name: 'Pendle / USDT' },
    ],
  },
  us: {
    title: '美股 / ETF',
    eyebrow: '行情 / US',
    description: '7 只美股与 2 只 ETF 一屏查看；点击代码切图，也可查询其他标的。',
    dataLabel: '延迟行情',
    dataTone: 'delayed',
    dataNote: '免费美股数据存在延迟，仅供查看，不作为交易成交依据。',
    searchPlaceholder: '输入股票代码，如 TSLA',
    symbols: [
      { symbol: 'NASDAQ:AAPL', code: 'AAPL', name: 'Apple' },
      { symbol: 'NASDAQ:AEHR', code: 'AEHR', name: 'Aehr Test Systems' },
      { symbol: 'NASDAQ:MRVL', code: 'MRVL', name: 'Marvell Technology' },
      { symbol: 'NYSE:MP', code: 'MP', name: 'MP Materials' },
      { symbol: 'NASDAQ:FSLR', code: 'FSLR', name: 'First Solar' },
      { symbol: 'NYSE:LMT', code: 'LMT', name: 'Lockheed Martin' },
      { symbol: 'NYSE:NOC', code: 'NOC', name: 'Northrop Grumman' },
      { symbol: 'AMEX:VOO', code: 'VOO', name: 'Vanguard S&P 500 ETF' },
      { symbol: 'NASDAQ:QQQ', code: 'QQQ', name: 'Invesco QQQ' },
    ],
  },
};

const LEGACY_CRYPTO_DEFAULTS = [
  'BITGET:BGBUSDT',
  'BINANCE:ASTERUSDT',
  'BINANCE:USDCUSDT',
  'BINANCE:PENDLEUSDT',
] as const;

export function getMarketProfile(kind: MarketKind): MarketProfile {
  return MARKET_PROFILES[kind];
}

export function resolveMarketSymbol(kind: MarketKind, input: string): string {
  const profile = getMarketProfile(kind);
  let query = input.trim().toUpperCase().replace(/\s+/g, '');

  if (!query) throw new Error('请输入代码。');
  if (query === 'MPFSLR') throw new Error('请分别输入 MP 或 FSLR。');
  if (query === 'APPL') query = 'AAPL';
  if (!/^[A-Z0-9._:-]{1,40}$/.test(query)) {
    throw new Error('代码只能包含字母、数字、点、横线、下划线或冒号。');
  }

  const fixedSymbol = profile.symbols.find(({ code }) => code === query)?.symbol;
  if (fixedSymbol) return fixedSymbol;

  if (kind === 'crypto' && !query.includes(':')) {
    const pair = query.endsWith('USDT') ? query : `${query}USDT`;
    return profile.symbols.find(({ code }) => code === pair)?.symbol ?? `BINANCE:${pair}`;
  }

  return query;
}

export function createMarketSymbol(kind: MarketKind, input: string): MarketSymbol {
  const profile = getMarketProfile(kind);
  const symbol = resolveMarketSymbol(kind, input);
  const fixedSymbol = profile.symbols.find((item) => item.symbol === symbol);
  if (fixedSymbol) return { ...fixedSymbol };

  const code = symbol.replace(/^.*:/, '');
  const name = kind === 'crypto' && code.endsWith('USDT')
    ? `${code.slice(0, -4)} / USDT`
    : code;
  return { symbol, code, name };
}

export function migrateLegacyMarketWatchlist(
  kind: MarketKind,
  stored: readonly MarketSymbol[],
): MarketSymbol[] {
  if (
    kind !== 'crypto' ||
    stored.length !== LEGACY_CRYPTO_DEFAULTS.length ||
    !stored.every(({ symbol }, index) => symbol === LEGACY_CRYPTO_DEFAULTS[index])
  ) {
    return stored.map((item) => ({ ...item }));
  }

  return getMarketProfile('crypto').symbols.map((item) => ({ ...item }));
}

export function moveMarketSymbol(
  symbols: readonly MarketSymbol[],
  symbol: string,
  offset: -1 | 1,
): MarketSymbol[] {
  const index = symbols.findIndex((item) => item.symbol === symbol);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= symbols.length) {
    return symbols.map((item) => ({ ...item }));
  }

  const next = symbols.map((item) => ({ ...item }));
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function buildMarketOverviewUrl(
  kind: MarketKind,
  theme: MarketTheme,
  symbols: readonly MarketSymbol[] = getMarketProfile(kind).symbols,
): string {
  const profile = getMarketProfile(kind);
  const config = {
    colorTheme: theme,
    dateRange: '1D',
    showChart: false,
    locale: 'zh_CN',
    isTransparent: false,
    showSymbolLogo: true,
    showFloatingTooltip: false,
    width: '100%',
    height: '100%',
    tabs: [
      {
        title: profile.title,
        symbols: symbols.map(({ symbol, name }) => ({ s: symbol, d: name })),
      },
    ],
  };

  return `https://s.tradingview.com/embed-widget/market-overview/?locale=zh_CN#${encodeURIComponent(JSON.stringify(config))}`;
}

export function buildTradingViewChartUrl(
  symbol: string,
  kind: MarketKind,
  theme: MarketTheme,
): string {
  const params = new URLSearchParams({
    symbol,
    interval: kind === 'crypto' ? '60' : 'D',
    hidesidetoolbar: '1',
    symboledit: '1',
    saveimage: '0',
    hideideas: '1',
    theme,
    style: '1',
    timezone: 'Asia/Shanghai',
    withdateranges: '1',
    locale: 'zh_CN',
  });

  return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
}
