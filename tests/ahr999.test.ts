import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateAhr999Series,
  getAhr999Zone,
  parseAhr999Cache,
  parseBinanceDailyKlines,
  serializeAhr999Cache,
  type BitcoinDailyClose,
} from '../lib/ahr999.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function dailyCloses(count: number, close: (index: number) => number): BitcoinDailyClose[] {
  const start = Date.UTC(2024, 0, 1);
  return Array.from({ length: count }, (_, index) => ({
    openTime: start + index * DAY_MS,
    closeTime: start + (index + 1) * DAY_MS - 1,
    date: new Date(start + index * DAY_MS).toISOString().slice(0, 10),
    close: close(index),
  }));
}

test('Binance 日线解析价格、时间并按日期排序去重', () => {
  const parsed = parseBinanceDailyKlines([
    [2000, '0', '0', '0', '20', '0', 2999],
    [1000, '0', '0', '0', '10', '0', 1999],
    [2000, '0', '0', '0', '21', '0', 2999],
  ]);

  assert.deepEqual(parsed.map(({ openTime, close }) => ({ openTime, close })), [
    { openTime: 1000, close: 10 },
    { openTime: 2000, close: 21 },
  ]);
  assert.throws(() => parseBinanceDailyKlines([[1, 2]]), /字段不完整/);
});

test('AHR999 使用滚动几何均值计算经典指标', () => {
  const closes = dailyCloses(201, (index) => index < 199 ? 100 : 400);
  const points = calculateAhr999Series(closes, 200);

  assert.equal(points.length, 2);
  assert.ok(Math.abs(points[0].dcaCost - Math.exp((199 * Math.log(100) + Math.log(400)) / 200)) < 1e-10);
  assert.ok(points[1].ahr999 > 0);
  assert.throws(() => calculateAhr999Series(closes.slice(0, 1), 200), /至少需要 200/);
});

test('AHR999 区间边界稳定', () => {
  assert.equal(getAhr999Zone(0.449), 'bottom');
  assert.equal(getAhr999Zone(0.45), 'dca');
  assert.equal(getAhr999Zone(1.2), 'wait');
  assert.equal(getAhr999Zone(5), 'high');
});

test('AHR999 缓存可往返并拒绝损坏数据', () => {
  const points = calculateAhr999Series(dailyCloses(200, () => 100));
  const restored = parseAhr999Cache(serializeAhr999Cache(points, 123456));

  assert.deepEqual(restored, { fetchedAt: 123456, points });
  assert.equal(parseAhr999Cache('{"version":2}'), null);
  assert.equal(parseAhr999Cache('{"version":1,"fetchedAt":1,"points":[{"ahr999":0}]}'), null);
});
