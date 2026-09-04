import assert from 'node:assert/strict';
import test from 'node:test';

import type { CompoundInput } from '../lib/compound.ts';
import {
  JSON_VIEWER_CACHE_MAX_CHARS,
  parseCompoundCache,
  parseJsonViewerCache,
  serializeCompoundCache,
  serializeJsonViewerCache,
} from '../lib/tool-cache.ts';

const COMPOUND_INPUT: CompoundInput = {
  principal: 12_000,
  annualRatePct: 7.5,
  years: 12,
  months: 3,
  days: 5,
  compoundsPerYear: 12,
  cashFlows: [
    {
      id: 'deposit-original',
      direction: 'deposit',
      amount: 800,
      startMonth: 1,
      durationMonths: 60,
      intervalMonths: 1,
    },
    {
      id: 'withdrawal-original',
      direction: 'withdrawal',
      amount: 300,
      startMonth: 72,
      durationMonths: 24,
      intervalMonths: 3,
    },
  ],
};

test('复利缓存保留参数、币种和现金流，并重新生成内部 ID', () => {
  const restored = parseCompoundCache(serializeCompoundCache(COMPOUND_INPUT, 'USDT'));

  assert.ok(restored);
  assert.equal(restored.currency, 'USDT');
  assert.deepEqual(
    restored.input.cashFlows.map((plan) => ({
      direction: plan.direction,
      amount: plan.amount,
      startMonth: plan.startMonth,
      durationMonths: plan.durationMonths,
      intervalMonths: plan.intervalMonths,
    })),
    COMPOUND_INPUT.cashFlows.map((plan) => ({
      direction: plan.direction,
      amount: plan.amount,
      startMonth: plan.startMonth,
      durationMonths: plan.durationMonths,
      intervalMonths: plan.intervalMonths,
    })),
  );
  assert.equal(new Set(restored.input.cashFlows.map(({ id }) => id)).size, 2);
  assert.notEqual(restored.input.cashFlows[0].id, COMPOUND_INPUT.cashFlows[0].id);
});

test('复利缓存拒绝错误版本、非法字段和过多计划', () => {
  assert.equal(parseCompoundCache('{"version":2}'), null);
  assert.equal(
    parseCompoundCache(serializeCompoundCache({ ...COMPOUND_INPUT, principal: Number.NaN }, 'CNY')),
    null,
  );
  assert.equal(
    parseCompoundCache(JSON.stringify({
      version: 1,
      currency: 'CNY',
      input: { ...COMPOUND_INPUT, cashFlows: Array.from({ length: 21 }, () => COMPOUND_INPUT.cashFlows[0]) },
    })),
    null,
  );
});

test('JSON 缓存原样保留格式和非法草稿', () => {
  const formatted = '{\n  "name": "ZY5"\n}';
  const draft = '{"unfinished":';

  assert.equal(parseJsonViewerCache(serializeJsonViewerCache(formatted)), formatted);
  assert.equal(parseJsonViewerCache(serializeJsonViewerCache(draft)), draft);
});

test('JSON 缓存拒绝错误结构和超长内容', () => {
  assert.equal(parseJsonViewerCache('{"version":2,"input":"{}"}'), null);
  assert.equal(parseJsonViewerCache('{"version":1,"input":42}'), null);
  assert.equal(serializeJsonViewerCache('x'.repeat(JSON_VIEWER_CACHE_MAX_CHARS + 1)), null);
});
