export type CashFlowDirection = 'deposit' | 'withdrawal';

export type CashFlowPlan = {
  id: string;
  direction: CashFlowDirection;
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

function geometricSeries(ratio: number, count: number) {
  if (count <= 0) return 0;
  const delta = ratio - 1;
  if (delta === 0) return count;
  return Math.expm1(count * Math.log1p(delta)) / delta;
}

function valueAtTimeWithPlans(
  input: CompoundInput,
  timeYears: number,
  totalDuration: number,
) {
  const annualRate = input.annualRatePct / 100;
  const periodicBase = 1 + annualRate / input.compoundsPerYear;
  const growth = (years: number) => Math.pow(periodicBase, input.compoundsPerYear * years);

  let total = input.principal * growth(timeYears);
  let invested = input.principal;
  let cashFlowCount = 0;
  let totalDeposits = input.principal;
  let totalWithdrawals = 0;

  for (const plan of input.cashFlows) {
    if (plan.amount === 0) continue;
    const startYears = plan.startMonth / 12;
    const countingTime = Math.min(timeYears, totalDuration);
    if (countingTime + EPSILON < startYears) continue;

    const plannedCount = Math.ceil(plan.durationMonths / plan.intervalMonths - EPSILON);
    const elapsedMonths = (countingTime - startYears) * 12;
    const elapsedCount = Math.floor(elapsedMonths / plan.intervalMonths + EPSILON) + 1;
    const count = Math.max(0, Math.min(plannedCount, elapsedCount));
    if (count === 0) continue;

    const signedAmount = plan.direction === 'withdrawal' ? -plan.amount : plan.amount;
    const mostRecentTime = (plan.startMonth + (count - 1) * plan.intervalMonths) / 12;
    const ratio = growth(plan.intervalMonths / 12);
    const residualGrowth = growth(Math.max(0, timeYears - mostRecentTime));
    total += signedAmount * residualGrowth * geometricSeries(ratio, count);
    invested += signedAmount * count;
    cashFlowCount += count;
    if (signedAmount > 0) totalDeposits += signedAmount * count;
    else totalWithdrawals += Math.abs(signedAmount) * count;
  }

  if (![total, invested, totalDeposits, totalWithdrawals].every(Number.isFinite)) {
    throw new Error('结果超出可计算范围，请缩短时长或降低利率。');
  }

  return {
    timeYears,
    total,
    invested,
    interest: total - invested,
    cashFlowCount,
    totalDeposits,
    totalWithdrawals,
  };
}

export function valueAtTime(
  input: CompoundInput,
  timeYears: number,
  totalDuration = durationInYears(input),
) {
  return valueAtTimeWithPlans(input, timeYears, totalDuration);
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
  const points = Array.from({ length: samples }, (_, index) => {
    const timeYears = (totalDuration * index) / (samples - 1);
    const point = valueAtTimeWithPlans(input, timeYears, totalDuration);
    return {
      timeYears: point.timeYears,
      total: point.total,
      invested: point.invested,
      interest: point.interest,
    };
  });
  const finalPoint = valueAtTimeWithPlans(input, totalDuration, totalDuration);
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
  };
}
