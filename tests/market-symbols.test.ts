import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMarketOverviewUrl,
  buildTradingViewChartUrl,
  createMarketSymbol,
  getMarketProfile,
  migrateLegacyMarketWatchlist,
  moveMarketSymbol,
  resolveMarketSymbol,
} from '../lib/market-symbols.ts';

test('币价固定自选使用明确的交易所代码', () => {
  const profile = getMarketProfile('crypto');

  assert.deepEqual(
    profile.symbols.map(({ symbol }) => symbol),
    [
      'BINANCE:BTCUSDT',
      'BINANCE:ETHUSDT',
      'BINANCE:BNBUSDT',
      'BITGET:BGBUSDT',
      'OKX:OKBUSDT',
      'BINANCE:ASTERUSDT',
      'BINANCE:USDCUSDT',
      'BINANCE:PENDLEUSDT',
    ],
  );
  assert.equal(profile.dataTone, 'live');
});

test('美股自选修正 AAPL，并将 MP 与 FSLR 拆成两只标的', () => {
  const profile = getMarketProfile('us');
  const symbols = profile.symbols.map(({ symbol }) => symbol);

  assert.ok(symbols.includes('NASDAQ:AAPL'));
  assert.ok(symbols.includes('NYSE:MP'));
  assert.ok(symbols.includes('NASDAQ:FSLR'));
  assert.equal(symbols.includes('NASDAQ:APPL'), false);
  assert.equal(profile.dataTone, 'delayed');
});

test('行情总览使用中文主题并包含完整自选列表', () => {
  const profile = getMarketProfile('us');
  const url = new URL(buildMarketOverviewUrl('us', 'dark'));
  const config = JSON.parse(decodeURIComponent(url.hash.slice(1)));

  assert.equal(url.hostname, 's.tradingview.com');
  assert.equal(config.colorTheme, 'dark');
  assert.equal(config.locale, 'zh_CN');
  assert.equal(config.showChart, false);
  assert.deepEqual(config.tabs[0].symbols.map(({ s }: { s: string }) => s), profile.symbols.map(({ symbol }) => symbol));
});

test('行情总览支持浏览器自选列表', () => {
  const custom = [createMarketSymbol('crypto', 'BNB')];
  const url = new URL(buildMarketOverviewUrl('crypto', 'light', custom));
  const config = JSON.parse(decodeURIComponent(url.hash.slice(1)));

  assert.deepEqual(config.tabs[0].symbols, [
    { s: 'BINANCE:BNBUSDT', d: 'BNB / USDT' },
  ]);
});

test('图表查询修正常见误写并生成可嵌入地址', () => {
  assert.equal(resolveMarketSymbol('us', 'appl'), 'NASDAQ:AAPL');
  assert.equal(resolveMarketSymbol('crypto', ' bgbusdt '), 'BITGET:BGBUSDT');
  assert.equal(resolveMarketSymbol('crypto', 'BNB'), 'BINANCE:BNBUSDT');
  assert.equal(resolveMarketSymbol('crypto', 'BTCUSDT'), 'BINANCE:BTCUSDT');
  assert.equal(resolveMarketSymbol('crypto', 'OKB'), 'OKX:OKBUSDT');
  assert.equal(resolveMarketSymbol('us', 'TSLA'), 'TSLA');
  assert.throws(() => resolveMarketSymbol('us', 'MPFSLR'), /MP 或 FSLR/);

  const url = new URL(buildTradingViewChartUrl('NASDAQ:AAPL', 'us', 'light'));
  assert.equal(url.hostname, 's.tradingview.com');
  assert.equal(url.searchParams.get('symbol'), 'NASDAQ:AAPL');
  assert.equal(url.searchParams.get('locale'), 'zh_CN');
  assert.equal(url.searchParams.get('interval'), 'D');
});

test('仅将未定制的旧币价默认列表迁移为新默认顺序', () => {
  const profile = getMarketProfile('crypto');
  const legacy = [
    { symbol: 'BITGET:BGBUSDT', code: 'BGBUSDT', name: 'BGB' },
    { symbol: 'BINANCE:ASTERUSDT', code: 'ASTERUSDT', name: 'ASTER' },
    { symbol: 'BINANCE:USDCUSDT', code: 'USDCUSDT', name: 'USDC' },
    { symbol: 'BINANCE:PENDLEUSDT', code: 'PENDLEUSDT', name: 'PENDLE' },
  ];
  const migrated = migrateLegacyMarketWatchlist('crypto', legacy);

  assert.deepEqual(
    migrated.map(({ symbol }) => symbol),
    profile.symbols.map(({ symbol }) => symbol),
  );

  const customized = [
    legacy[0],
    { symbol: 'BINANCE:SOLUSDT', code: 'SOLUSDT', name: 'SOL' },
  ];
  assert.deepEqual(migrateLegacyMarketWatchlist('crypto', customized), customized);
  assert.deepEqual(migrateLegacyMarketWatchlist('crypto', []), []);
  assert.deepEqual(migrateLegacyMarketWatchlist('us', legacy), legacy);
});

test('自选可以前后移动，边界操作保持顺序', () => {
  const symbols = [
    createMarketSymbol('crypto', 'BTC'),
    createMarketSymbol('crypto', 'ETH'),
    createMarketSymbol('crypto', 'BNB'),
  ];

  assert.deepEqual(
    moveMarketSymbol(symbols, 'BINANCE:ETHUSDT', -1).map(({ code }) => code),
    ['ETHUSDT', 'BTCUSDT', 'BNBUSDT'],
  );
  assert.deepEqual(
    moveMarketSymbol(symbols, 'BINANCE:BTCUSDT', -1).map(({ code }) => code),
    ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
  );
});
