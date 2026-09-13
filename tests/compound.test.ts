import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateCompound,
  durationInYears,
  valueAtTime,
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
    amountType: 'fixed',
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

function approximatelyEqual(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be close to ${expected}`);
}

test('固定金额仍符合期末年金与期初投入的解析结果', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    annualRatePct: 12,
    compoundsPerYear: 12,
    cashFlows: [
      cashFlow(),
      cashFlow({ amount: 500, startMonth: 0, durationMonths: 1 }),
      cashFlow({ direction: 'withdrawal', amount: 200, startMonth: 12, durationMonths: 1 }),
    ],
  };
  const result = calculateCompound(input);
  const expected = 1500 * 1.01 ** 12 + 100 * ((1.01 ** 12 - 1) / 0.01) - 200;
  approximatelyEqual(result.finalValue, expected);
  assert.equal(result.invested, 2500);
  assert.equal(result.totalDeposits, 2700);
  assert.equal(result.totalWithdrawals, 200);
  assert.equal(result.cashFlowCount, 14);
  assert.deepEqual(valueAtTime(input, 1), {
    timeYears: 1,
    total: result.finalValue,
    invested: result.invested,
    interest: result.interest,
    cashFlowCount: result.cashFlowCount,
    totalDeposits: result.totalDeposits,
    totalWithdrawals: result.totalWithdrawals,
  });
});

test('每月按当月资产比例拿走或追加资金，而不是按初始本金', () => {
  for (const direction of ['withdrawal', 'deposit'] as const) {
    const result = calculateCompound({
      ...BASE_INPUT,
      annualRatePct: 0,
      cashFlows: [cashFlow({ amountType: 'percentage', direction, amount: 2 })],
    });
    const expected = 1000 * (direction === 'withdrawal' ? 0.98 : 1.02) ** 12;
    approximatelyEqual(result.finalValue, expected);
    approximatelyEqual(result.interest, 0);
    assert.equal(result.cashFlowCount, 12);
    if (direction === 'withdrawal') {
      approximatelyEqual(result.totalWithdrawals, 1000 - expected);
      assert.equal(result.totalDeposits, 1000);
    } else {
      approximatelyEqual(result.totalDeposits, expected);
      assert.equal(result.totalWithdrawals, 0);
    }
  }
});

test('先计息到执行月，再用执行前资产计算百分比', () => {
  const result = calculateCompound({
    ...BASE_INPUT,
    annualRatePct: 12,
    compoundsPerYear: 12,
    years: 0,
    months: 1,
    cashFlows: [cashFlow({ direction: 'withdrawal', amountType: 'percentage', amount: 2 })],
  });
  approximatelyEqual(result.finalValue, 989.8);
  approximatelyEqual(result.totalWithdrawals, 20.2);
  approximatelyEqual(result.interest, 10);
});

test('同月的固定金额和百分比计划共用现金流执行前资产，顺序不改变结果', () => {
  const flows = [
    cashFlow({ id: 'fixed', amount: 100, durationMonths: 1 }),
    cashFlow({ id: 'deposit', amountType: 'percentage', amount: 10, durationMonths: 1 }),
    cashFlow({ id: 'withdrawal', direction: 'withdrawal', amountType: 'percentage', amount: 20, durationMonths: 1 }),
  ];
  const input = { ...BASE_INPUT, annualRatePct: 0, cashFlows: flows };
  const result = calculateCompound(input);
  assert.equal(result.finalValue, 1000);
  assert.equal(result.totalDeposits, 1200);
  assert.equal(result.totalWithdrawals, 200);
  assert.equal(result.cashFlowCount, 3);
  for (const reordered of [[flows[2], flows[0], flows[1]], [...flows].reverse()]) {
    assert.deepEqual(calculateCompound({ ...input, cashFlows: reordered }), result);
  }
});

test('百分比计划保留第 0 月立即执行、半开区间与投资终点计入的语义', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    cashFlows: [cashFlow({
      amountType: 'percentage',
      direction: 'withdrawal',
      amount: 10,
      startMonth: 0,
      durationMonths: 13,
      intervalMonths: 12,
    })],
  };
  const result = calculateCompound(input);
  assert.equal(result.points[0].total, 900);
  approximatelyEqual(result.finalValue, 891);
  approximatelyEqual(result.totalWithdrawals, 199);
  assert.equal(result.cashFlowCount, 2);
  const halfOpen = calculateCompound({
    ...input,
    cashFlows: [cashFlow({ ...input.cashFlows[0], durationMonths: 12 })],
  });
  assert.equal(halfOpen.cashFlowCount, 1);
  approximatelyEqual(halfOpen.finalValue, 990);
  const unevenInterval = calculateCompound({
    ...input,
    annualRatePct: 0,
    cashFlows: [cashFlow({ ...input.cashFlows[0], startMonth: 1, durationMonths: 3, intervalMonths: 2 })],
  });
  assert.equal(unevenInterval.cashFlowCount, 2);
  assert.equal(unevenInterval.finalValue, 810);
});

test('负余额时百分比金额为零，固定金额仍可造成缺口或补回资金', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    annualRatePct: 0,
    cashFlows: [
      cashFlow({ direction: 'withdrawal', amount: 1200, startMonth: 0, durationMonths: 1 }),
      cashFlow({ amountType: 'percentage', amount: 50, durationMonths: 2 }),
      cashFlow({ direction: 'withdrawal', amountType: 'percentage', amount: 50, durationMonths: 2 }),
      cashFlow({ amount: 300, startMonth: 2, durationMonths: 1 }),
    ],
  };
  const result = calculateCompound(input);
  assert.equal(valueAtTime(input, 1 / 12).total, -200);
  assert.equal(result.finalValue, 100);
  assert.equal(result.totalDeposits, 1300);
  assert.equal(result.totalWithdrawals, 1200);
  assert.equal(result.cashFlowCount, 6);
  assert.equal(result.interest, 0);
});

test('百分比为 0 时不执行，拿走 100% 后不反向拿走或凭空产生投入', () => {
  const zero = calculateCompound({
    ...BASE_INPUT,
    cashFlows: [cashFlow({ amountType: 'percentage', amount: 0 })],
  });
  assert.equal(zero.cashFlowCount, 0);
  approximatelyEqual(zero.finalValue, 1100);
  const emptied = calculateCompound({
    ...BASE_INPUT,
    annualRatePct: 0,
    cashFlows: [
      cashFlow({ amountType: 'percentage', direction: 'withdrawal', amount: 100, startMonth: 0 }),
      cashFlow({ amountType: 'percentage', amount: 100 }),
    ],
  });
  assert.equal(emptied.finalValue, 0);
  assert.equal(emptied.totalDeposits, 1000);
  assert.equal(emptied.totalWithdrawals, 1000);
  assert.equal(emptied.cashFlowCount, 24);
});

test('曲线采样和任意时点查询与混合计划的最终结果一致', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    years: 2,
    days: 17,
    annualRatePct: -8,
    compoundsPerYear: 12,
    cashFlows: [
      cashFlow({ amount: 250, startMonth: 0, durationMonths: 24, intervalMonths: 3 }),
      cashFlow({ direction: 'withdrawal', amountType: 'percentage', amount: 7, durationMonths: 30, intervalMonths: 2 }),
    ],
  };
  const sparse = calculateCompound(input, 24);
  const dense = calculateCompound(input, 500);
  const { points: sparsePoints, ...sparseTotals } = sparse;
  const { points: densePoints, ...denseTotals } = dense;
  assert.deepEqual(sparseTotals, denseTotals);
  for (const point of [...sparsePoints, densePoints.at(-1)!]) {
    const queried = valueAtTime(input, point.timeYears);
    assert.equal(point.total, queried.total);
    assert.equal(point.invested, queried.invested);
    assert.equal(point.interest, queried.interest);
    approximatelyEqual(queried.interest, queried.total + queried.totalWithdrawals - queried.totalDeposits);
  }
  assert.equal(densePoints.at(-1)!.total, dense.finalValue);
  const afterHorizon = valueAtTime(input, 3);
  const horizon = valueAtTime(input, durationInYears(input));
  assert.equal(afterHorizon.cashFlowCount, horizon.cashFlowCount);
  approximatelyEqual(afterHorizon.total, horizon.total * (1 - 0.08 / 12) ** (12 * (3 - horizon.timeYears)));
});

test('200 年、20 条百分比计划仅按实际事件变化，与采样密度无关', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    years: 200,
    annualRatePct: 0,
    cashFlows: Array.from({ length: 20 }, (_, index) => cashFlow({
      id: `long-${index}`,
      amountType: 'percentage',
      direction: index % 2 === 0 ? 'deposit' : 'withdrawal',
      amount: 0.5,
      durationMonths: 2400,
    })),
  };
  const result = calculateCompound(input, 500);
  assert.equal(result.finalValue, 1000);
  assert.equal(result.cashFlowCount, 48_000);
  assert.equal(result.totalDeposits, 121_000);
  assert.equal(result.totalWithdrawals, 120_000);
  assert.equal(result.interest, 0);
  assert.equal(result.points.length, 500);
  assert.equal(result.periods.length, 2401);
  assert.equal(result.periods.at(-1)!.month, 2400);
  assert.equal(calculateCompound(input, 24).finalValue, result.finalValue);
});

test('拒绝非法百分比与金额方式；早期查询不受未来溢出干扰', () => {
  for (const amount of [-1, 100.01]) {
    assert.throws(() => calculateCompound({
      ...BASE_INPUT,
      cashFlows: [cashFlow({ amountType: 'percentage', amount })],
    }), /资产百分比必须在 0 到 100/);
  }
  assert.throws(() => calculateCompound({
    ...BASE_INPUT,
    cashFlows: [cashFlow({ amountType: 'unknown' as CashFlowPlan['amountType'] })],
  }), /金额方式无效/);
  const overflowing: CompoundInput = {
    ...BASE_INPUT,
    principal: 1e308,
    cashFlows: [cashFlow({ amountType: 'percentage', amount: 100 })],
  };
  assert.equal(valueAtTime(overflowing, 0).total, 1e308);
  assert.throws(() => calculateCompound(overflowing), /超出可计算范围/);
});

test('月明细按计息后的同一资产基数记录实际金额、占比和当期收益', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    years: 0,
    months: 2,
    annualRatePct: 12,
    compoundsPerYear: 12,
    cashFlows: [
      cashFlow({ id: 'fixed-deposit', amount: 100 }),
      cashFlow({ id: 'percentage-withdrawal', direction: 'withdrawal', amountType: 'percentage', amount: 2 }),
    ],
  };
  const result = calculateCompound(input);
  assert.equal(result.periods.length, 3);
  const first = result.periods[1];
  assert.equal(first.month, 1);
  assert.equal(first.startTimeYears, 0);
  assert.equal(first.timeYears, 1 / 12);
  assert.equal(first.openingValue, 1000);
  assert.equal(first.valueBeforeCashFlows, 1010);
  assert.equal(first.periodInterest, 10);
  assert.equal(first.deposits, 100);
  assert.equal(first.withdrawals, 20.2);
  assert.equal(first.total, 1089.8);
  assert.deepEqual(first.cashFlows, [
    {
      planId: 'fixed-deposit',
      direction: 'deposit',
      amountType: 'fixed',
      configuredAmount: 100,
      amount: 100,
      assetPercentage: 100 / 1010 * 100,
    },
    {
      planId: 'percentage-withdrawal',
      direction: 'withdrawal',
      amountType: 'percentage',
      configuredAmount: 2,
      amount: 20.2,
      assetPercentage: 20.2 / 1010 * 100,
    },
  ]);
  const second = result.periods[2];
  assert.equal(second.openingValue, first.total);
  assert.equal(second.startTimeYears, first.timeYears);
  approximatelyEqual(second.valueBeforeCashFlows, 1100.698);
  approximatelyEqual(second.periodInterest, 10.898);
  approximatelyEqual(second.withdrawals, 22.01396);
  assert.notEqual(second.cashFlows[0].assetPercentage, first.cashFlows[0].assetPercentage);
  assert.equal(second.total, result.finalValue);
});

test('第 0 月单独展示立即执行现金流，不把本金当作当月投入或产生收益', () => {
  const result = calculateCompound({
    ...BASE_INPUT,
    cashFlows: [
      cashFlow({ id: 'deposit', amount: 200, startMonth: 0, durationMonths: 1 }),
      cashFlow({ id: 'withdrawal', direction: 'withdrawal', amountType: 'percentage', amount: 10, startMonth: 0, durationMonths: 1 }),
    ],
  });
  const immediate = result.periods[0];
  assert.equal(immediate.month, 0);
  assert.equal(immediate.startTimeYears, 0);
  assert.equal(immediate.timeYears, 0);
  assert.equal(immediate.openingValue, 1000);
  assert.equal(immediate.valueBeforeCashFlows, 1000);
  assert.equal(immediate.periodInterest, 0);
  assert.equal(immediate.deposits, 200);
  assert.equal(immediate.withdrawals, 100);
  assert.equal(immediate.total, 1100);
  assert.equal(immediate.invested, 1100);
  assert.deepEqual(immediate.cashFlows.map((flow) => flow.assetPercentage), [20, 10]);
  assert.equal(result.periods[1].openingValue, 1100);
  assert.equal(result.periods[1].deposits, 0);
  assert.equal(result.periods[1].withdrawals, 0);
  assert.deepEqual(result.periods[1].cashFlows, []);
});

test('不足整月的末期只计息至真实终点，不执行下个月的计划', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    years: 0,
    months: 2,
    days: 10,
    annualRatePct: 12,
    compoundsPerYear: 12,
    cashFlows: [cashFlow({ amountType: 'percentage', amount: 5 })],
  };
  const result = calculateCompound(input);
  assert.deepEqual(result.periods.map((period) => period.month), [0, 1, 2, 3]);
  const tail = result.periods[3];
  assert.equal(tail.startTimeYears, 2 / 12);
  assert.equal(tail.timeYears, durationInYears(input));
  assert.equal(tail.openingValue, result.periods[2].total);
  assert.deepEqual(tail.cashFlows, []);
  assert.equal(tail.deposits, 0);
  assert.equal(tail.withdrawals, 0);
  assert.equal(tail.total, tail.valueBeforeCashFlows);
  assert.equal(tail.periodInterest, tail.total - tail.openingValue);
  approximatelyEqual(tail.total, tail.openingValue * 1.01 ** (12 * 10 / 365));
  assert.equal(result.cashFlowCount, 2);
  assert.equal(tail.total, result.finalValue);
  assert.equal(tail.interest, result.interest);
  assert.equal(tail.invested, result.invested);
  const lessThanMonth = calculateCompound({ ...input, months: 0, days: 1 });
  assert.deepEqual(lessThanMonth.periods.map((period) => period.month), [0, 1]);
  assert.equal(lessThanMonth.periods[1].timeYears, 1 / 365);
  assert.equal(lessThanMonth.cashFlowCount, 0);
});

test('负资产期间记录实际执行的零金额百分比，无法定义的占比使用 null', () => {
  const result = calculateCompound({
    ...BASE_INPUT,
    annualRatePct: 0,
    cashFlows: [
      cashFlow({ id: 'initial-withdrawal', direction: 'withdrawal', amount: 1200, startMonth: 0, durationMonths: 1 }),
      cashFlow({ id: 'percentage', amountType: 'percentage', amount: 10, durationMonths: 1 }),
      cashFlow({ id: 'fixed', amount: 50, durationMonths: 1 }),
      cashFlow({ id: 'zero-plan', amountType: 'percentage', amount: 0 }),
      cashFlow({ id: 'later-plan', amount: 300, startMonth: 13 }),
    ],
  });
  const period = result.periods[1];
  assert.equal(period.valueBeforeCashFlows, -200);
  assert.equal(period.deposits, 50);
  assert.equal(period.total, -150);
  assert.deepEqual(period.cashFlows.map((flow) => ({ id: flow.planId, amount: flow.amount, percentage: flow.assetPercentage })), [
    { id: 'fixed', amount: 50, percentage: null },
    { id: 'percentage', amount: 0, percentage: null },
  ]);
  assert.equal(result.cashFlowCount, 3);
});

test('所有月明细守恒、累计等于结果，并与任意时点查询完全一致', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    years: 2,
    days: 7,
    annualRatePct: -5,
    compoundsPerYear: 365,
    cashFlows: [
      cashFlow({ id: 'deposit', amount: 71.23, startMonth: 0, durationMonths: 24, intervalMonths: 3 }),
      cashFlow({ id: 'percentage', direction: 'withdrawal', amountType: 'percentage', amount: 2.7, durationMonths: 24 }),
    ],
  };
  const result = calculateCompound(input);
  let deposits = input.principal;
  let withdrawals = 0;
  let interest = 0;
  let flowCount = 0;
  for (const [index, period] of result.periods.entries()) {
    if (index > 0) {
      assert.equal(period.openingValue, result.periods[index - 1].total);
      assert.equal(period.startTimeYears, result.periods[index - 1].timeYears);
    }
    assert.equal(period.periodInterest, period.valueBeforeCashFlows - period.openingValue);
    assert.equal(period.total, period.valueBeforeCashFlows + period.deposits - period.withdrawals);
    const queried = valueAtTime(input, period.timeYears);
    assert.equal(period.total, queried.total);
    assert.equal(period.invested, queried.invested);
    assert.equal(period.interest, queried.interest);
    deposits += period.deposits;
    withdrawals += period.withdrawals;
    interest += period.periodInterest;
    flowCount += period.cashFlows.length;
  }
  assert.equal(deposits, result.totalDeposits);
  assert.equal(withdrawals, result.totalWithdrawals);
  assert.equal(flowCount, result.cashFlowCount);
  approximatelyEqual(interest, result.interest);
  assert.equal(result.periods.at(-1)!.total, result.points.at(-1)!.total);
  assert.equal(result.periods.at(-1)!.total, result.finalValue);
});

test('极小正资产导致展示占比溢出时，仍保留有效余额与实际现金流', () => {
  const result = calculateCompound({
    ...BASE_INPUT,
    annualRatePct: -99,
    compoundsPerYear: 1,
    years: 156,
    cashFlows: [cashFlow({ amount: 100, startMonth: 1872, durationMonths: 1 })],
  });
  const finalPeriod = result.periods.at(-1)!;
  assert.ok(finalPeriod.valueBeforeCashFlows > 0);
  assert.equal(100 / finalPeriod.valueBeforeCashFlows * 100, Infinity);
  assert.equal(finalPeriod.cashFlows.length, 1);
  assert.equal(finalPeriod.cashFlows[0].amount, 100);
  assert.equal(finalPeriod.cashFlows[0].assetPercentage, null);
  approximatelyEqual(result.finalValue, 100);
  assert.equal(result.totalDeposits, 1100);
  assert.ok(Number.isFinite(result.interest));
});
