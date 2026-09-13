export type CashFlowDirection = 'deposit' | 'withdrawal';
export type CashFlowAmountType = 'fixed' | 'percentage';

export type CashFlowPlan = {
  id: string;
  direction: CashFlowDirection;
  amountType: CashFlowAmountType;
  amount: number;
  startMonth: number;
  durationMonths: number;
  intervalMonths: number;
};

export type CompoundInput = {
  principal: number;
  annualRatePct: number;
  years: number;
  months: number;
  days: number;
  compoundsPerYear: number;
  cashFlows: CashFlowPlan[];
};

export type CompoundPoint = {
  timeYears: number;
  total: number;
  invested: number;
  interest: number;
};

export type CashFlowExecution = {
  planId: string;
  direction: CashFlowDirection;
  amountType: CashFlowAmountType;
  configuredAmount: number;
  amount: number;
  // Null when the asset base is nonpositive or the percentage exceeds numeric range.
  assetPercentage: number | null;
};

export type CompoundPeriod = CompoundPoint & {
  month: number;
  startTimeYears: number;
  openingValue: number;
  valueBeforeCashFlows: number;
  periodInterest: number;
  deposits: number;
  withdrawals: number;
  cashFlows: CashFlowExecution[];
};

export type CompoundResult = {
  durationYears: number;
  finalValue: number;
  invested: number;
  interest: number;
  effectiveAnnualRate: number;
  cashFlowCount: number;
  totalDeposits: number;
  totalWithdrawals: number;
  points: CompoundPoint[];
  periods: CompoundPeriod[];
};

const EPSILON = 1e-9;
const MAX_CASH_FLOW_PLANS = 20;
const MAX_SCHEDULE_MONTHS = 2400;

export function durationInYears(input: Pick<CompoundInput, 'years' | 'months' | 'days'>) {
  return input.years + input.months / 12 + input.days / 365;
}

export function validateCompoundInput(input: CompoundInput) {
  const values = [
    input.principal,
    input.annualRatePct,
    input.years,
    input.months,
    input.days,
    input.compoundsPerYear,
  ];

  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('请输入有效数字。');
  }
  if (input.principal < 0) {
    throw new Error('本金不能为负数。');
  }
  if (input.years < 0 || input.months < 0 || input.days < 0) {
    throw new Error('投资时长不能为负数。');
  }
  if (input.compoundsPerYear <= 0) {
    throw new Error('复利频率必须大于 0。');
  }
  if (!Array.isArray(input.cashFlows)) {
    throw new Error('现金流计划格式无效。');
  }
  if (input.cashFlows.length > MAX_CASH_FLOW_PLANS) {
    throw new Error(`现金流计划最多 ${MAX_CASH_FLOW_PLANS} 条。`);
  }

  input.cashFlows.forEach((plan, index) => {
    const planValues = [plan.amount, plan.startMonth, plan.durationMonths, plan.intervalMonths];
    if (planValues.some((value) => !Number.isFinite(value))) {
      throw new Error(`现金流计划 ${index + 1} 请输入有效数字。`);
    }
    if (plan.direction !== 'deposit' && plan.direction !== 'withdrawal') {
      throw new Error(`现金流计划 ${index + 1} 的类型无效。`);
    }
    if (plan.amountType !== 'fixed' && plan.amountType !== 'percentage') {
      throw new Error(`现金流计划 ${index + 1} 的金额方式无效，请选择固定金额或资产百分比。`);
    }
    if (plan.amountType === 'percentage' && (plan.amount < 0 || plan.amount > 100)) {
      throw new Error(`现金流计划 ${index + 1} 的资产百分比必须在 0 到 100 之间。`);
    }
    if (plan.amount < 0) {
      throw new Error(`现金流计划 ${index + 1} 的金额不能为负数，请通过类型选择投入或拿走。`);
    }
    if (
      !Number.isInteger(plan.startMonth) ||
      !Number.isInteger(plan.durationMonths) ||
      !Number.isInteger(plan.intervalMonths)
    ) {
      throw new Error(`现金流计划 ${index + 1} 的月份与周期必须为整数。`);
    }
    if (plan.startMonth < 0 || plan.durationMonths <= 0 || plan.intervalMonths <= 0) {
      throw new Error(`现金流计划 ${index + 1} 的开始月、持续时间或周期无效。`);
    }
    if (
      plan.startMonth > MAX_SCHEDULE_MONTHS ||
      plan.durationMonths > MAX_SCHEDULE_MONTHS ||
      plan.intervalMonths > MAX_SCHEDULE_MONTHS
    ) {
      throw new Error(`现金流计划 ${index + 1} 最多支持 ${MAX_SCHEDULE_MONTHS} 个月。`);
    }
  });

  const duration = durationInYears(input);
  if (duration <= 0) {
    throw new Error('投资时长至少需要 1 天。');
  }
  if (duration > 200) {
    throw new Error('当前最多计算 200 年。');
  }

  const periodicBase = 1 + input.annualRatePct / 100 / input.compoundsPerYear;
  if (periodicBase <= 0) {
    throw new Error('当前利率与复利频率组合无法计算，请提高利率。');
  }
}

type CashFlowSnapshot = CompoundPoint & {
  cashFlowCount: number;
  totalDeposits: number;
  totalWithdrawals: number;
};

// Use a stable sum so reordering simultaneous plans cannot change rounding.
function sumAmounts(amounts: number[]) {
  return amounts.sort((left, right) => left - right).reduce((total, amount) => total + amount, 0);
}

function toPoint(snapshot: CashFlowSnapshot): CompoundPoint {
  return {
    timeYears: snapshot.timeYears,
    total: snapshot.total,
    invested: snapshot.invested,
    interest: snapshot.interest,
  };
}

function createCalculation(input: CompoundInput, totalDuration: number) {
  const periodicBase = 1 + input.annualRatePct / 100 / input.compoundsPerYear;
  const growth = (years: number) => Math.pow(periodicBase, input.compoundsPerYear * years);
  const initial: CashFlowSnapshot = {
    timeYears: 0,
    total: input.principal,
    invested: input.principal,
    interest: 0,
    cashFlowCount: 0,
    totalDeposits: input.principal,
    totalWithdrawals: 0,
  };
  const snapshots: CashFlowSnapshot[] = [];
  const periods: CompoundPeriod[] = [];
  let previous = initial;

  function appendPeriod(month: number, timeYears: number, executePlans: boolean) {
    const startTimeYears = previous.timeYears;
    const openingValue = previous.total;
    const valueBeforeCashFlows = openingValue * growth(timeYears - startTimeYears);
    const assetBase = Math.max(0, valueBeforeCashFlows);
    const cashFlows: CashFlowExecution[] = executePlans ? input.cashFlows
      .filter((plan) => {
        // Configured zero amounts are no-ops. Nonzero percentages still execute
        // against an empty asset base, producing a zero-amount history entry.
        return plan.amount !== 0 && month >= plan.startMonth &&
          month < plan.startMonth + plan.durationMonths &&
          (month - plan.startMonth) % plan.intervalMonths === 0;
      })
      .map((plan) => {
        const amount = plan.amountType === 'percentage' ? assetBase * (plan.amount / 100) : plan.amount;
        const assetPercentage = valueBeforeCashFlows > 0 ? amount / valueBeforeCashFlows * 100 : null;
        return {
          planId: plan.id,
          direction: plan.direction,
          amountType: plan.amountType,
          configuredAmount: plan.amount,
          amount,
          assetPercentage: assetPercentage !== null && Number.isFinite(assetPercentage) ? assetPercentage : null,
        };
      })
      .sort((left, right) => left.planId < right.planId ? -1 : left.planId > right.planId ? 1 : 0) : [];
    const deposits = sumAmounts(cashFlows.filter((flow) => flow.direction === 'deposit').map((flow) => flow.amount));
    const withdrawals = sumAmounts(cashFlows.filter((flow) => flow.direction === 'withdrawal').map((flow) => flow.amount));
    const total = valueBeforeCashFlows + deposits - withdrawals;
    const totalDeposits = previous.totalDeposits + deposits;
    const totalWithdrawals = previous.totalWithdrawals + withdrawals;
    const invested = totalDeposits - totalWithdrawals;
    const interest = total - invested;
    const periodInterest = valueBeforeCashFlows - openingValue;
    if (![valueBeforeCashFlows, total, invested, interest, periodInterest, totalDeposits, totalWithdrawals].every(Number.isFinite) ||
      cashFlows.some((flow) => !Number.isFinite(flow.amount))) {
      throw new Error('结果超出可计算范围，请缩短时长或降低利率。');
    }
    previous = {
      timeYears,
      total,
      invested,
      interest,
      cashFlowCount: previous.cashFlowCount + cashFlows.length,
      totalDeposits,
      totalWithdrawals,
    };
    snapshots.push(previous);
    periods.push({
      ...toPoint(previous),
      month,
      startTimeYears,
      openingValue,
      valueBeforeCashFlows,
      periodInterest,
      deposits,
      withdrawals,
      cashFlows,
    });
  }

  // All plans execute at integer month boundaries. The partial final period
  // accrues interest only; it never borrows the next month's scheduled flows.
  const completeMonths = Math.floor((totalDuration + EPSILON) * 12);
  for (let month = 0; month <= completeMonths; month += 1) {
    const timeYears = month > 0 && Math.abs(month / 12 - totalDuration) <= EPSILON
      ? totalDuration
      : month / 12;
    appendPeriod(month, timeYears, true);
  }
  if (totalDuration > previous.timeYears) {
    appendPeriod(completeMonths + 1, totalDuration, false);
  }

  // Fixed and percentage amounts share this history, so monthly details,
  // arbitrary queries and chart samples all use identical balances.
  const evaluate = (timeYears: number): CashFlowSnapshot => {
    let lower = 0;
    let upper = snapshots.length;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (snapshots[middle].timeYears <= timeYears + EPSILON) lower = middle + 1;
      else upper = middle;
    }
    const snapshot = lower === 0 ? initial : snapshots[lower - 1];
    const total = snapshot.total * growth(Math.max(0, timeYears - snapshot.timeYears));
    const interest = total - snapshot.invested;
    if (![total, interest].every(Number.isFinite)) {
      throw new Error('结果超出可计算范围，请缩短时长或降低利率。');
    }
    return { ...snapshot, timeYears, total, interest };
  };
  return { evaluate, periods };
}

export function valueAtTime(
  input: CompoundInput,
  timeYears: number,
  totalDuration = durationInYears(input),
) {
  validateCompoundInput(input);
  if (![timeYears, totalDuration].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error('查询时间与现金流截止时间必须是有效的非负数字。');
  }
  // Future cash flows are irrelevant to this query, including future overflow.
  return createCalculation(input, Math.min(timeYears, totalDuration)).evaluate(timeYears);
}

export function calculateCompound(input: CompoundInput, requestedSamples = 121): CompoundResult {
  validateCompoundInput(input);
  if (!Number.isFinite(requestedSamples)) {
    throw new Error('采样数量必须是有效数字。');
  }
  const totalDuration = durationInYears(input);
  const periodicBase = 1 + input.annualRatePct / 100 / input.compoundsPerYear;
  const effectiveAnnualRate = Math.pow(periodicBase, input.compoundsPerYear) - 1;
  if (!Number.isFinite(effectiveAnnualRate)) {
    throw new Error('结果超出可计算范围，请缩短时长或降低利率。');
  }

  const samples = Math.max(24, Math.min(500, Math.round(requestedSamples)));
  const { evaluate, periods } = createCalculation(input, totalDuration);
  const points = Array.from({ length: samples }, (_, index) => {
    const timeYears = (totalDuration * index) / (samples - 1);
    const point = evaluate(timeYears);
    return {
      timeYears: point.timeYears,
      total: point.total,
      invested: point.invested,
      interest: point.interest,
    };
  });
  const finalPoint = evaluate(totalDuration);
  points[points.length - 1] = {
    timeYears: totalDuration,
    total: finalPoint.total,
    invested: finalPoint.invested,
    interest: finalPoint.interest,
  };

  return {
    durationYears: totalDuration,
    finalValue: finalPoint.total,
    invested: finalPoint.invested,
    interest: finalPoint.interest,
    effectiveAnnualRate,
    cashFlowCount: finalPoint.cashFlowCount,
    totalDeposits: finalPoint.totalDeposits,
    totalWithdrawals: finalPoint.totalWithdrawals,
    points,
    periods,
  };
}
