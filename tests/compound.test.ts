import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateCompound,
  durationInYears,
  type CashFlowPlan,
  type CompoundInput,
} from '../lib/compound.ts';

const BASE_INPUT: CompoundInput = {
  principal: 1000,
  annualRatePct: 10,
  years: 1,
  months: 0,
  days: 0,
  compoundsPerYear: 1,
  cashFlows: [],
};

function cashFlow(overrides: Partial<CashFlowPlan> = {}): CashFlowPlan {
  return {
    id: 'flow-test',
    direction: 'deposit',
    amount: 100,
    startMonth: 1,
    durationMonths: 12,
    intervalMonths: 1,
    ...overrides,
  };
}

test('一次性本金按年复利', () => {
  const result = calculateCompound(BASE_INPUT);
  assert.ok(Math.abs(result.finalValue - 1100) < 1e-8);
  assert.equal(result.invested, 1000);
  assert.ok(Math.abs(result.interest - 100) < 1e-8);
});

test('零利率时按开始月、持续时间和周期执行投入', () => {
  const result = calculateCompound({
    ...BASE_INPUT,
    annualRatePct: 0,
    compoundsPerYear: 12,
    cashFlows: [cashFlow()],
  });

  assert.equal(result.cashFlowCount, 12);
  assert.equal(result.totalDeposits, 2200);
  assert.equal(result.totalWithdrawals, 0);
  assert.equal(result.invested, 2200);
  assert.equal(result.finalValue, 2200);
  assert.equal(result.interest, 0);
});

test('多条现金流计划可组合投入和拿走', () => {
  const result = calculateCompound({
    ...BASE_INPUT,
    annualRatePct: 0,
    cashFlows: [
      cashFlow({ id: 'deposit', amount: 100, startMonth: 1, durationMonths: 6 }),
      cashFlow({
        id: 'withdrawal',
        direction: 'withdrawal',
        amount: 50,
        startMonth: 4,
        durationMonths: 3,
      }),
    ],
  });

  assert.equal(result.cashFlowCount, 9);
  assert.equal(result.totalDeposits, 1600);
  assert.equal(result.totalWithdrawals, 150);
  assert.equal(result.invested, 1450);
  assert.equal(result.finalValue, 1450);
});

test('越早投入拥有更长复利时间', () => {
  const common: CompoundInput = {
    ...BASE_INPUT,
    principal: 0,
    annualRatePct: 12,
    compoundsPerYear: 12,
  };
  const early = calculateCompound({
    ...common,
    cashFlows: [cashFlow({ startMonth: 0, durationMonths: 1 })],
  });
  const late = calculateCompound({
    ...common,
    cashFlows: [cashFlow({ startMonth: 12, durationMonths: 1 })],
  });

  assert.equal(early.invested, late.invested);
  assert.ok(early.finalValue > late.finalValue);
});

test('投资区间外的现金流不会计入结果', () => {
  const result = calculateCompound({
    ...BASE_INPUT,
    annualRatePct: 0,
    cashFlows: [cashFlow({ startMonth: 13 })],
  });

  assert.equal(result.cashFlowCount, 0);
  assert.equal(result.finalValue, 1000);
});

test('非整除周期遵循半开区间并计入投资终点', () => {
  const everyTwoMonths = calculateCompound({
    ...BASE_INPUT,
    annualRatePct: 0,
    cashFlows: [cashFlow({ startMonth: 1, durationMonths: 3, intervalMonths: 2 })],
  });
  const atHorizon = calculateCompound({
    ...BASE_INPUT,
    annualRatePct: 0,
    cashFlows: [cashFlow({ startMonth: 12, durationMonths: 1 })],
  });

  assert.equal(everyTwoMonths.cashFlowCount, 2);
  assert.equal(atHorizon.cashFlowCount, 1);
});

test('拿走金额可以形成负余额并表示资金缺口', () => {
  const result = calculateCompound({
    ...BASE_INPUT,
    annualRatePct: 0,
    cashFlows: [cashFlow({ direction: 'withdrawal', amount: 200 })],
  });

  assert.equal(result.totalWithdrawals, 2400);
  assert.equal(result.invested, -1400);
  assert.equal(result.finalValue, -1400);
});

test('年、月、日按固定口径换算', () => {
  assert.ok(Math.abs(durationInYears({ years: 2, months: 6, days: 10 }) - (2.5 + 10 / 365)) < 1e-12);
});

test('拒绝空时长、非法现金流与非正的周期增长基数', () => {
  assert.throws(
    () => calculateCompound({ ...BASE_INPUT, years: 0 }),
    /至少需要 1 天/,
  );
  assert.throws(
    () => calculateCompound({ ...BASE_INPUT, cashFlows: [cashFlow({ amount: -1 })] }),
    /金额不能为负数/,
  );
  assert.throws(
    () => calculateCompound({ ...BASE_INPUT, cashFlows: [cashFlow({ startMonth: 1.5 })] }),
    /必须为整数/,
  );
  assert.throws(
    () => calculateCompound({ ...BASE_INPUT, annualRatePct: -100, compoundsPerYear: 1 }),
    /无法计算/,
  );
  assert.throws(
    () => calculateCompound({ ...BASE_INPUT, annualRatePct: 1e308, compoundsPerYear: 365 }),
    /超出可计算范围/,
  );
  assert.throws(
    () => calculateCompound(BASE_INPUT, Number.NaN),
    /采样数量必须是有效数字/,
  );
});
