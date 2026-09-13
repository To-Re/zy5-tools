import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateCompound,
  valueAtTime,
  type CashFlowPlan,
  type CompoundInput,
} from '../lib/compound.ts';

const BASE_INPUT: CompoundInput = {
  principal: 1000,
  annualRatePct: 0,
  years: 0,
  months: 3,
  days: 0,
  compoundsPerYear: 12,
  cashFlows: [],
};

function plan(overrides: Partial<CashFlowPlan> = {}): CashFlowPlan {
  return {
    id: 'percentage-test',
    direction: 'withdrawal',
    amountType: 'percentage',
    amount: 10,
    startMonth: 1,
    durationMonths: 3,
    intervalMonths: 1,
    ...overrides,
  };
}

function near(actual: number, expected: number) {
  assert.ok(
    Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-11),
    `expected ${expected}, received ${actual}`,
  );
}

function permutations<T>(values: T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, otherIndex) => index !== otherIndex))
      .map((rest) => [value, ...rest]),
  );
}

test('每月先计息，再按该月资产拿走百分比，并累计当期实际金额', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    annualRatePct: 12,
    cashFlows: [plan()],
  };
  const result = calculateCompound(input);

  // 月利率为 1%：1010 拿走 101；918.09 拿走 91.809；
  // 834.54381 拿走 83.454381。每月执行后的资产分别如下。
  near(valueAtTime(input, 1 / 12).total, 909);
  near(valueAtTime(input, 2 / 12).total, 826.281);
  near(result.finalValue, 751.089429);
  near(result.totalWithdrawals, 276.263381);
  near(result.totalDeposits, 1000);
  near(result.invested, 723.736619);
  near(result.interest, 27.35281);
  assert.equal(result.cashFlowCount, 3);
  near(result.interest, result.finalValue + result.totalWithdrawals - result.totalDeposits);
});

test('百分比投入是外部追加资金，百分比以每月计息后的资产计算', () => {
  const result = calculateCompound({
    ...BASE_INPUT,
    annualRatePct: 12,
    cashFlows: [plan({ direction: 'deposit', amount: 2 })],
  });

  // 三次追加分别为 20.2、20.81004、21.438503208；
  // 最终资产也可独立写为 1000 × (1.01 × 1.02)^3。
  near(result.finalValue, 1093.363663608);
  near(result.finalValue, 1000 * (1.01 * 1.02) ** 3);
  near(result.totalDeposits, 1062.448543208);
  near(result.totalWithdrawals, 0);
  near(result.invested, 1062.448543208);
  near(result.interest, 30.9151204);
  assert.equal(result.cashFlowCount, 3);
});

test('同月固定金额与百分比投入拿走共享执行前资产，全部排列结果相同', () => {
  const plans = [
    plan({ id: 'fixed-in', direction: 'deposit', amountType: 'fixed', amount: 300, durationMonths: 2 }),
    plan({ id: 'fixed-out', amountType: 'fixed', amount: 100, durationMonths: 2 }),
    plan({ id: 'percentage-in', direction: 'deposit', amount: 20, durationMonths: 2 }),
    plan({ id: 'percentage-out', amount: 10, durationMonths: 2 }),
  ];

  for (const cashFlows of permutations(plans)) {
    const result = calculateCompound({ ...BASE_INPUT, annualRatePct: 12, months: 2, cashFlows });

    // 月 1：1010 + 300 - 100 + 202 - 101 = 1311。
    // 月 2：1324.11 + 300 - 100 + 264.822 - 132.411 = 1656.521。
    near(result.finalValue, 1656.521);
    near(result.totalDeposits, 2066.822);
    near(result.totalWithdrawals, 433.411);
    near(result.interest, 23.11);
    assert.equal(result.cashFlowCount, 8);
  }
});

test('延迟开始的百分比计划按半开持续区间执行，投资终点的另一计划仍计入', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    months: 6,
    cashFlows: [
      plan({ id: 'delayed', startMonth: 2, durationMonths: 4, intervalMonths: 2 }),
      plan({ id: 'at-horizon', direction: 'deposit', amount: 50, startMonth: 6, durationMonths: 1 }),
      plan({ id: 'after-horizon', direction: 'deposit', amount: 100, startMonth: 7 }),
    ],
  };
  const result = calculateCompound(input);

  near(valueAtTime(input, 1 / 12).total, 1000);
  near(valueAtTime(input, 2 / 12).total, 900);
  near(valueAtTime(input, 3 / 12).total, 900);
  near(valueAtTime(input, 4 / 12).total, 810);
  near(valueAtTime(input, 5 / 12).total, 810);
  // 第一条计划只执行月 2、4，月 6 不拿走；终点追加 810 的 50%。
  near(result.finalValue, 1215);
  near(result.totalDeposits, 1405);
  near(result.totalWithdrawals, 190);
  near(result.interest, 0);
  assert.equal(result.cashFlowCount, 3);
});

test('百分比计划在非整除的持续区间内保留最后一次执行', () => {
  const result = calculateCompound({
    ...BASE_INPUT,
    months: 6,
    cashFlows: [plan({ startMonth: 4, durationMonths: 3, intervalMonths: 2 })],
  });

  // [4, 7) 中每两个月执行一次，月 4 和投资终点月 6 均生效。
  near(result.finalValue, 810);
  near(result.totalWithdrawals, 190);
  assert.equal(result.cashFlowCount, 2);
});

test('负余额时百分比不翻转资金方向，固定投入恢复后下月继续按资产执行', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    principal: 100,
    months: 4,
    cashFlows: [
      plan({ id: 'initial-shortfall', amountType: 'fixed', amount: 200, startMonth: 0, durationMonths: 1 }),
      plan({ id: 'percentage-in', direction: 'deposit', amount: 20, durationMonths: 4 }),
      plan({ id: 'percentage-out', amount: 10, durationMonths: 4 }),
      plan({ id: 'recovery', direction: 'deposit', amountType: 'fixed', amount: 150, startMonth: 2, durationMonths: 1 }),
    ],
  };
  const result = calculateCompound(input);

  near(valueAtTime(input, 0).total, -100);
  near(valueAtTime(input, 1 / 12).total, -100);
  // 月 2 执行前资产仍为负，百分比为 0；固定投入才使余额恢复到 50。
  near(valueAtTime(input, 2 / 12).total, 50);
  near(valueAtTime(input, 3 / 12).total, 55);
  near(result.finalValue, 60.5);
  near(result.totalDeposits, 271);
  near(result.totalWithdrawals, 210.5);
  near(result.interest, 0);
});

test('100% 拿走后百分比投入不会从零生成资金，固定投入后才能恢复', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    principal: 100,
    months: 4,
    cashFlows: [
      plan({ id: 'empty', amount: 100, durationMonths: 1 }),
      plan({ id: 'percentage-in', direction: 'deposit', amount: 50, startMonth: 2, durationMonths: 3 }),
      plan({ id: 'fixed-in', direction: 'deposit', amountType: 'fixed', amount: 50, startMonth: 3, durationMonths: 1 }),
    ],
  };
  const result = calculateCompound(input);

  near(valueAtTime(input, 1 / 12).total, 0);
  near(valueAtTime(input, 2 / 12).total, 0);
  near(valueAtTime(input, 3 / 12).total, 50);
  near(result.finalValue, 75);
  near(result.totalDeposits, 175);
  near(result.totalWithdrawals, 100);
  near(result.interest, 0);
});

test('百分比范围含 0 和 100，固定金额不受百分比上限限制', () => {
  for (const amount of [0, 100]) {
    assert.doesNotThrow(() => calculateCompound({ ...BASE_INPUT, cashFlows: [plan({ amount })] }));
  }
  for (const amount of [-1, 100.0001, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => calculateCompound({ ...BASE_INPUT, cashFlows: [plan({ amount })] }));
  }
  for (const amountType of [undefined, 'ratio']) {
    assert.throws(() => calculateCompound({
      ...BASE_INPUT,
      cashFlows: [plan({ amountType: amountType as CashFlowPlan['amountType'] })],
    }));
  }
  const fixed = calculateCompound({
    ...BASE_INPUT,
    cashFlows: [plan({ amountType: 'fixed', amount: 150, durationMonths: 1 })],
  });
  near(fixed.finalValue, 850);
});

test('采样点与同一时刻的查询及资金守恒一致，改变采样数量不影响计算结果', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    annualRatePct: 18,
    years: 1,
    months: 5,
    days: 10,
    cashFlows: [
      plan({ id: 'monthly-out', amount: 2.5, durationMonths: 24 }),
      plan({ id: 'quarterly-in', direction: 'deposit', amount: 1.5, startMonth: 3, intervalMonths: 3, durationMonths: 18 }),
      plan({ id: 'fixed-in', direction: 'deposit', amountType: 'fixed', amount: 300, startMonth: 0, intervalMonths: 12, durationMonths: 24 }),
    ],
  };
  const results = [24, 121, 500].map((samples) => calculateCompound(input, samples));
  const reference = results[0];

  for (const result of results) {
    near(result.finalValue, reference.finalValue);
    near(result.totalDeposits, reference.totalDeposits);
    near(result.totalWithdrawals, reference.totalWithdrawals);
    near(result.interest, reference.interest);
    assert.equal(result.cashFlowCount, reference.cashFlowCount);
    near(result.interest, result.finalValue + result.totalWithdrawals - result.totalDeposits);

    for (const point of result.points) {
      const queried = valueAtTime(input, point.timeYears);
      near(point.total, queried.total);
      near(point.invested, queried.invested);
      near(point.interest, queried.interest);
      near(point.invested, queried.totalDeposits - queried.totalWithdrawals);
      near(point.interest, point.total + queried.totalWithdrawals - queried.totalDeposits);
    }
    near(result.points.at(-1)!.total, result.finalValue);
  }
});

test('月度明细：0 月立即执行，逐月记录实际金额、资产占比与累计资金守恒', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    annualRatePct: 12,
    months: 2,
    cashFlows: [
      plan({ id: 'initial-in', direction: 'deposit', amountType: 'fixed', amount: 200, startMonth: 0, durationMonths: 1 }),
      plan({ id: 'initial-out', amount: 10, startMonth: 0, durationMonths: 1 }),
      plan({ id: 'monthly-in', direction: 'deposit', amountType: 'fixed', amount: 100, durationMonths: 2 }),
      plan({ id: 'monthly-out', amount: 10, durationMonths: 2 }),
    ],
  };
  const result = calculateCompound(input);

  assert.equal(result.periods.length, 3);
  assert.deepEqual(result.periods.map((period) => period.month), [0, 1, 2]);
  const initial = result.periods[0];
  near(initial.timeYears, 0);
  near(initial.startTimeYears, 0);
  near(initial.openingValue, 1000);
  near(initial.periodInterest, 0);
  near(initial.valueBeforeCashFlows, 1000);
  near(initial.deposits, 200);
  near(initial.withdrawals, 100);
  near(initial.total, 1100);
  assert.deepEqual(initial.cashFlows.toSorted((a, b) => a.planId.localeCompare(b.planId)), [
    { planId: 'initial-in', direction: 'deposit', amountType: 'fixed', configuredAmount: 200, amount: 200, assetPercentage: 20 },
    { planId: 'initial-out', direction: 'withdrawal', amountType: 'percentage', configuredAmount: 10, amount: 100, assetPercentage: 10 },
  ]);

  const firstMonth = result.periods[1];
  near(firstMonth.startTimeYears, 0);
  near(firstMonth.timeYears, 1 / 12);
  near(firstMonth.openingValue, 1100);
  near(firstMonth.periodInterest, 11);
  near(firstMonth.valueBeforeCashFlows, 1111);
  near(firstMonth.total, 1099.9);
  assert.deepEqual(firstMonth.cashFlows.map((flow) => flow.planId).sort(), ['monthly-in', 'monthly-out']);
  const firstDeposit = firstMonth.cashFlows.find((flow) => flow.planId === 'monthly-in')!;
  const firstWithdrawal = firstMonth.cashFlows.find((flow) => flow.planId === 'monthly-out')!;
  near(firstDeposit.amount, 100);
  near(firstDeposit.assetPercentage!, 100 / 1111 * 100);
  near(firstWithdrawal.amount, 111.1);
  near(firstWithdrawal.assetPercentage!, 10);

  const secondMonth = result.periods[2];
  near(secondMonth.startTimeYears, 1 / 12);
  near(secondMonth.timeYears, 2 / 12);
  near(secondMonth.openingValue, 1099.9);
  near(secondMonth.periodInterest, 10.999);
  near(secondMonth.valueBeforeCashFlows, 1110.899);
  near(secondMonth.cashFlows.find((flow) => flow.planId === 'monthly-out')!.amount, 111.0899);
  near(secondMonth.total, 1099.8091);
  near(result.interest, 21.999);

  let deposits = input.principal;
  let withdrawals = 0;
  let interest = 0;
  for (const period of result.periods) {
    near(period.openingValue + period.periodInterest, period.valueBeforeCashFlows);
    near(period.valueBeforeCashFlows + period.deposits - period.withdrawals, period.total);
    near(period.deposits, period.cashFlows.filter((flow) => flow.direction === 'deposit')
      .reduce((sum, flow) => sum + flow.amount, 0));
    near(period.withdrawals, period.cashFlows.filter((flow) => flow.direction === 'withdrawal')
      .reduce((sum, flow) => sum + flow.amount, 0));
    deposits += period.deposits;
    withdrawals += period.withdrawals;
    interest += period.periodInterest;
    near(period.invested, deposits - withdrawals);
    near(period.interest, interest);
    near(period.total, valueAtTime(input, period.timeYears).total);
  }
  near(deposits, result.totalDeposits);
  near(withdrawals, result.totalWithdrawals);
  near(interest, result.interest);
  near(result.periods.at(-1)!.total, result.finalValue);
});

test('月度明细：负余额及零余额时保留当期执行记录，资产占比为空', () => {
  for (const withdrawal of [100, 200]) {
    const result = calculateCompound({
      ...BASE_INPUT,
      principal: 100,
      months: 2,
      cashFlows: [
        plan({ id: 'empty', amountType: 'fixed', amount: withdrawal, startMonth: 0, durationMonths: 1 }),
        plan({ id: 'restore', direction: 'deposit', amountType: 'fixed', amount: 150, durationMonths: 1 }),
        plan({ id: 'percentage', amount: 10, durationMonths: 2 }),
      ],
    });
    const initial = result.periods[0];
    near(initial.cashFlows[0].assetPercentage!, withdrawal);

    const firstMonth = result.periods[1];
    near(firstMonth.valueBeforeCashFlows, 100 - withdrawal);
    assert.deepEqual(firstMonth.cashFlows.toSorted((a, b) => a.planId.localeCompare(b.planId)), [
      { planId: 'percentage', direction: 'withdrawal', amountType: 'percentage', configuredAmount: 10, amount: 0, assetPercentage: null },
      { planId: 'restore', direction: 'deposit', amountType: 'fixed', configuredAmount: 150, amount: 150, assetPercentage: null },
    ]);
    near(firstMonth.deposits, 150);
    near(firstMonth.withdrawals, 0);
    near(firstMonth.total, 250 - withdrawal);

    const secondMonth = result.periods[2];
    assert.equal(secondMonth.cashFlows.length, 1);
    assert.equal(secondMonth.cashFlows[0].planId, 'percentage');
    near(secondMonth.cashFlows[0].assetPercentage!, 10);
    near(secondMonth.cashFlows[0].amount, (250 - withdrawal) * 0.1);
    near(secondMonth.total, (250 - withdrawal) * 0.9);
  }
});

test('月度明细：不足一月的尾段按真实终点计息，不提前执行下月计划', () => {
  const input: CompoundInput = {
    ...BASE_INPUT,
    annualRatePct: 12,
    months: 1,
    days: 15,
    cashFlows: [
      plan({ id: 'monthly', durationMonths: 3 }),
      plan({ id: 'next-month-only', direction: 'deposit', amountType: 'fixed', amount: 1000, startMonth: 2, durationMonths: 1 }),
    ],
  };
  const result = calculateCompound(input);
  const tail = result.periods.at(-1)!;
  const expectedTailValue = 909 * 1.01 ** (12 * 15 / 365);

  assert.equal(result.periods.length, 3);
  near(result.periods[1].total, 909);
  near(tail.startTimeYears, 1 / 12);
  near(tail.timeYears, 1 / 12 + 15 / 365);
  near(tail.openingValue, 909);
  near(tail.periodInterest, expectedTailValue - 909);
  near(tail.valueBeforeCashFlows, expectedTailValue);
  near(tail.total, expectedTailValue);
  near(tail.deposits, 0);
  near(tail.withdrawals, 0);
  assert.deepEqual(tail.cashFlows, []);
  near(result.finalValue, expectedTailValue);
  near(result.totalDeposits, 1000);
  near(result.totalWithdrawals, 101);
  assert.equal(result.cashFlowCount, 1);
});

test('月度明细：200 年保留 2400 个月与第 0 月，独立于曲线采样数量', () => {
  const result = calculateCompound({
    ...BASE_INPUT,
    years: 200,
    months: 0,
    cashFlows: [plan({ amount: 1, durationMonths: 2400 })],
  }, 24);

  assert.equal(result.points.length, 24);
  assert.equal(result.periods.length, 2401);
  assert.equal(result.periods[0].cashFlows.length, 0);
  assert.equal(result.periods.at(-1)!.month, 2400);
  near(result.periods.at(-1)!.timeYears, 200);
  assert.equal(result.periods.at(-1)!.cashFlows.length, 1);
  near(result.finalValue, 1000 * 0.99 ** 2400);
  near(result.periods.at(-1)!.total, result.finalValue);
  near(result.periods.reduce((sum, period) => sum + period.withdrawals, 0), result.totalWithdrawals);
  near(result.finalValue + result.totalWithdrawals, 1000);
  assert.equal(result.cashFlowCount, 2400);
});
