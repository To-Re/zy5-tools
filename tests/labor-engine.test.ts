import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePayroll, calculateAnnualTax, calculateContributionPlan, calculatePensionScenario, invertNetSalary, solvePensionTarget, solveMonotoneTarget, type TaxRule, type PayrollRule, type PayrollInput, type PensionRule, type PensionInput, type CalculationResult } from '../lib/labor-engine.ts';

// Synthetic fixtures exercise arithmetic; they do not assert any local policy is verified.
const scope = { region: 'fixture-region', population: 'fixture-population', validFrom: '2026-01-01', validTo: '2026-12-31', verifiedOn: '2026-10-12' };
const evidence = { sourceIds: ['fixture-source'], scope };
const tax: TaxRule = { ...evidence, id: 'fixture-tax', annualDeductionCents: 6000000, monthlyDeductionCents: 500000, brackets: [
  { upToCents: 3600000, rateBps: 300, quickDeductionCents: 0 },
  { upToCents: 14400000, rateBps: 1000, quickDeductionCents: 252000 },
  { upToCents: 30000000, rateBps: 2000, quickDeductionCents: 1692000 },
  { upToCents: 42000000, rateBps: 2500, quickDeductionCents: 3192000 },
  { upToCents: 66000000, rateBps: 3000, quickDeductionCents: 5292000 },
  { upToCents: 96000000, rateBps: 3500, quickDeductionCents: 8592000 },
  { upToCents: null, rateBps: 4500, quickDeductionCents: 18192000 },
] };
const rule: PayrollRule = { ...evidence, id: 'fixture-payroll', regime: 'employee', complete: true, tax, contributions: [{ ...evidence, id: 'pension', label: '测试养老', baseMinCents: 500000, baseMaxCents: 3000000, employeeRateBps: 800, employerRateBps: 1600, rounding: 'half-up-cent' }] };
const input: PayrollInput = { month: '2026-01', grossCents: 1000000, contributionBases: { pension: 1000000 }, additionalDeductionCents: 0, currentDeductionMonths: 1, extraEmployerCostCents: 10000, prior: { grossCents: 0, personalContributionCents: 0, additionalDeductionCents: 0, taxPaidCents: 0, deductionMonths: 0 } };
function amount(result: CalculationResult, id: string): number {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  const resultLine = result.lines.find((item) => item.id === id);
  assert.ok(resultLine);
  return resultLine.amountCents;
}
const pensionRule: PensionRule = { ...evidence, id: 'fixture-pension', regime: 'employee', supportedPopulation: 'fixture-population', baseRateBps: 100, serviceYearDecimals: 4, componentRounding: 'ceil-jiao', totalRounding: 'half-up-cent', accountDivisors: { 60: 139 }, supportedRetirementYears: [2026], minimumContributionMonths: 180, minimumRetirementAgeMonths: 600, maximumRetirementAgeMonths: 792 };
const pension: PensionInput = { ruleYear: 2026, ruleDate: '2026-10-12', population: 'fixture-population', benefitRegionConfirmed: true, qualificationConfirmed: true, hasTransitionalOrDeemedService: false, retirementAgeMonths: 720, contributionMonths: 240, pensionBaseCents: 1000000, averageContributionIndex: 1, personalAccountCents: 13900000, payoutYears: 20 };

test('手算黄金样例：10000工资，个人800，单位1600，预扣126，实发9074，单位成本11700', () => {
  const result = calculatePayroll(input, rule);
  assert.equal(amount(result, 'personal-total'), 80000);
  assert.equal(amount(result, 'employer-total'), 160000);
  assert.equal(amount(result, 'withholding'), 12600);
  assert.equal(amount(result, 'net'), 907400);
  assert.equal(amount(result, 'company-cost'), 1170000);
  if (result.ok) for (const item of result.lines) { assert.ok(item.sourceIds.length); assert.ok(item.formula); assert.ok(item.scope.verifiedOn); assert.ok(Number.isSafeInteger(item.amountCents)); }
});
test('累计跨级距与本期负预扣差额不直接退款', () => {
  const march = { ...input, month: '2026-03', prior: { grossCents: 4000000, personalContributionCents: 160000, additionalDeductionCents: 0, taxPaidCents: 85200, deductionMonths: 2 } };
  // (50000 - 2400 - 15000) * 3% = 978; already paid 852 => 126.
  assert.equal(amount(calculatePayroll(march, rule), 'withholding'), 12600);
  assert.equal(amount(calculatePayroll({ ...march, prior: { ...march.prior, taxPaidCents: 999999 } }, rule), 'withholding'), 0);
  assert.equal(amount(calculateAnnualTax({ year: 2026, taxableComprehensiveIncomeCents: 12000000, personalContributionCents: 960000, additionalDeductionCents: 0, taxPaidCents: 300000 }, tax), 'annual-balance'), -48000);
});
test('基数独立于当期工资，上下限与半分舍入均明确', () => {
  assert.equal(amount(calculatePayroll({ ...input, contributionBases: { pension: 0 } }, rule), 'personal-total'), 40000);
  assert.equal(amount(calculatePayroll({ ...input, contributionBases: { pension: 99999999 } }, rule), 'personal-total'), 240000);
  const fractionalRule = { ...rule, contributions: [{ ...rule.contributions[0], employeeRateBps: 5000, baseMinCents: 0 }] };
  assert.equal(amount(calculatePayroll({ ...input, contributionBases: { pension: 101 } }, fractionalRule), 'personal-total'), 51);
});
test('规则缺失、过期、无累计背景与非法金额均拒算', () => {
  for (const modified of [{ ...input, grossCents: NaN }, { ...input, grossCents: 0.1 }, { ...input, month: '2027-01' }, { ...input, contributionBases: {} }, { ...input, currentDeductionMonths: 2 }]) assert.equal(calculatePayroll(modified, rule).ok, false);
  assert.equal(calculatePayroll(input, { ...rule, complete: false }).ok, false);
  assert.equal(calculatePayroll(input, { ...rule, sourceIds: [] }).ok, false);
  assert.equal(calculatePayroll({ ...input, prior: undefined } as unknown as PayrollInput, rule).ok, false);
});
test('年度汇算负数为退税差额，不与月度预扣合并', () => {
  const annual = calculateAnnualTax({ year: 2026, taxableComprehensiveIncomeCents: 6000000, personalContributionCents: 0, additionalDeductionCents: 0, taxPaidCents: 5000 }, tax);
  assert.equal(amount(annual, 'annual-tax'), 0);
  assert.equal(amount(annual, 'annual-balance'), -5000);
});
test('分期按每月选择规则：年中变更、跨区、缺失历史与重叠拒算', () => {
  const first = { ...rule, scope: { ...scope, validTo: '2026-06-30' } };
  const second = { ...rule, scope: { ...scope, validFrom: '2026-07-01' }, contributions: [{ ...rule.contributions[0], employeeRateBps: 1000 }] };
  const segment = { id: 'a', region: scope.region, regime: 'employee' as const, from: '2026-06', to: '2026-07', bases: { pension: 1000000 } };
  const result = calculateContributionPlan([segment], [first, second]);
  assert.equal(amount(result, 'a-2026-06-personal'), 80000);
  assert.equal(amount(result, 'a-2026-07-personal'), 100000);
  assert.equal(calculateContributionPlan([segment], [first]).ok, false);
  assert.equal(calculateContributionPlan([segment, { ...segment, id: 'b', region: 'other' }], [first, second]).ok, false);
  assert.equal(calculateContributionPlan([{ ...segment, regime: 'resident' }], [first, second]).ok, false);
  assert.equal(calculateContributionPlan([{ ...segment, region: 'unverified' }], [first, second]).ok, false);
});
test('养老金手算：10000×(1+1)÷2×20×1% + 139000÷139 = 3000/月', () => {
  const result = calculatePensionScenario(pension, pensionRule);
  assert.equal(amount(result, 'pension-basic'), 200000);
  assert.equal(amount(result, 'pension-account'), 100000);
  assert.equal(amount(result, 'pension-monthly'), 300000);
  assert.equal(amount(result, 'pension-window'), 72000000);
});
test('养老金资格、身份、过渡性、非整周岁及新规有效日精确禁用', () => {
  for (const modified of [{ ...pension, benefitRegionConfirmed: false }, { ...pension, qualificationConfirmed: false }, { ...pension, hasTransitionalOrDeemedService: true }, { ...pension, retirementAgeMonths: 721 }, { ...pension, population: 'resident' }, { ...pension, ruleDate: '2025-10-12' }]) assert.equal(calculatePensionScenario(modified, pensionRule).ok, false);
  const newRule = { ...pensionRule, scope: { ...scope, validFrom: '2026-08-16' } };
  assert.equal(calculatePensionScenario({ ...pension, ruleDate: '2026-08-15' }, newRule).ok, false);
  assert.equal(calculatePensionScenario({ ...pension, ruleDate: '2026-08-16' }, newRule).ok, true);
});
test('跨省指数不重新夹上限，领取窗口不改变月金额或计发月数', () => {
  assert.equal(amount(calculatePensionScenario({ ...pension, averageContributionIndex: 4 }, pensionRule), 'pension-basic'), 500000);
  assert.equal(amount(calculatePensionScenario({ ...pension, payoutYears: 1 }, pensionRule), 'pension-monthly'), 300000);
});
test('单变量有界逆算完整报告唯一解、多解、无解', () => {
  assert.deepEqual(solveMonotoneTarget(5, 0, 10, (v) => v), { status: 'unique', minimum: 5, maximum: 5, attainableMinimumCents: 0, attainableMaximumCents: 10 });
  assert.equal(solveMonotoneTarget(5, 0, 10, (v) => v * 2).status, 'none');
  assert.equal(solveMonotoneTarget(50, 0, 10, (v) => v).status, 'none');
  const plateau = solveMonotoneTarget(1, 0, 10, (v) => Math.floor(v / 3));
  assert.equal(plateau.minimum, 3); assert.equal(plateau.maximum, 5); assert.equal(plateau.status, 'multiple');
  const inverted = invertNetSalary(input, 907400, { minCents: 0, maxCents: 5000000 }, rule);
  assert.ok(inverted.minimum !== undefined); assert.equal(amount(calculatePayroll({ ...input, grossCents: inverted.minimum! }, rule), 'net'), 907400);
  const target = solvePensionTarget(pension, 300000, { minAccountCents: 0, maxAccountCents: 50000000 }, pensionRule);
  assert.equal(target.status, 'multiple');
  assert.equal(amount(calculatePensionScenario({ ...pension, personalAccountCents: target.minimum! }, pensionRule), 'pension-monthly'), 300000);
  assert.equal(solvePensionTarget(pension, 2000000, { minAccountCents: 0, maxAccountCents: 50000000 }, pensionRule).status, 'none');
});

import { calculateRetirement, type RetirementRule, type RetirementCategory } from '../lib/labor-engine.ts';
const retirementRule: RetirementRule = { ...evidence, scope: { ...scope, validFrom: '2025-01-01', validTo: '2100-12-31' }, id: 'fixture-retirement', reforms: [
  { category: 'original-60', baseAgeMonths: 720, startBirthMonth: '1965-01', stepBirthMonths: 4, maxDelayMonths: 36 },
  { category: 'original-55', baseAgeMonths: 660, startBirthMonth: '1970-01', stepBirthMonths: 4, maxDelayMonths: 36 },
  { category: 'original-50', baseAgeMonths: 600, startBirthMonth: '1975-01', stepBirthMonths: 2, maxDelayMonths: 60 },
], maximumFlexibleMonths: 36, finalMinimumYear: 2039, minimumContributionMonthsByYear: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [2025 + i, i <= 4 ? 180 : 180 + (i - 4) * 6])) };
test('官方附表黄金边界：三类出生年月、步长切换和封顶', () => {
  const cases: Array<[RetirementCategory, string, string, number]> = [
    ['original-60', '1965-01', '2025-02', 721], ['original-60', '1965-04', '2025-05', 721], ['original-60', '1965-05', '2025-07', 722], ['original-60', '1976-08', '2039-07', 755], ['original-60', '1976-09', '2039-09', 756],
    ['original-55', '1970-01', '2025-02', 661], ['original-55', '1981-08', '2039-07', 695], ['original-55', '1981-09', '2039-09', 696],
    ['original-50', '1975-01', '2025-02', 601], ['original-50', '1975-02', '2025-03', 601], ['original-50', '1975-03', '2025-05', 602], ['original-50', '1984-10', '2039-09', 659], ['original-50', '1984-11', '2039-11', 660],
  ];
  for (const [category, birthMonth, expectedMonth, expectedAge] of cases) {
    const result = calculateRetirement({ birthMonth, category, choice: 'statutory', contributionMonths: 240 }, retirementRule);
    assert.equal(result.ok, true);
    if (result.ok) { assert.equal(result.statutoryRetirementMonth, expectedMonth); assert.equal(result.statutoryAgeMonths, expectedAge); }
  }
});
test('最低年限2030递增、提前按选择年、延迟按法定年', () => {
  const early = calculateRetirement({ birthMonth: '1970-01', category: 'original-60', choice: 'early', chosenRetirementMonth: '2030-01', contributionMonths: 186 }, retirementRule);
  assert.equal(early.ok, true);
  if (early.ok) { assert.equal(early.minimumContributionMonths, 186); assert.equal(early.contributionSufficient, true); }
  const late = calculateRetirement({ birthMonth: '1968-01', category: 'original-60', choice: 'late', chosenRetirementMonth: '2030-01', contributionMonths: 180 }, retirementRule);
  assert.equal(late.ok, true);
  if (late.ok) assert.equal(late.minimumContributionMonths, 180);
  assert.equal(calculateRetirement({ birthMonth: '1964-12', category: 'original-60', choice: 'late', chosenRetirementMonth: '2025-01', contributionMonths: 240 }, retirementRule).ok, false);
  assert.equal(calculateRetirement({ birthMonth: '1970-01', category: 'original-60', choice: 'early', chosenRetirementMonth: '2029-12', contributionMonths: 240 }, retirementRule).ok, false);
});

import { calculateVerifiedPayroll, invertVerifiedNetSalary, type VerifiedPayrollInput } from '../lib/labor-engine.ts';
const verifiedInput: VerifiedPayrollInput = { ...input, personalContributionCents: 100000, deductiblePersonalContributionCents: 80000, employerContributionCents: 160000, contributionsConfirmed: true };
test('实缴工资模式区分实际扣款与依法可扣数额，并拒未确认金额', () => {
  const verifiedRule = { ...evidence, id: 'verified', tax };
  const result = calculateVerifiedPayroll(verifiedInput, verifiedRule);
  assert.equal(amount(result, 'withholding'), 12600);
  assert.equal(amount(result, 'net'), 887400);
  assert.equal(amount(result, 'company-cost'), 1170000);
  assert.equal(calculateVerifiedPayroll({ ...verifiedInput, contributionsConfirmed: false }, verifiedRule).ok, false);
  assert.equal(calculateVerifiedPayroll({ ...verifiedInput, deductiblePersonalContributionCents: 100001 }, verifiedRule).ok, false);
  const inverse = invertVerifiedNetSalary(verifiedInput, 887400, { minCents: 0, maxCents: 5000000 }, verifiedRule);
  assert.ok(inverse.minimum !== undefined);
  assert.equal(amount(calculateVerifiedPayroll({ ...verifiedInput, grossCents: inverse.minimum! }, verifiedRule), 'net'), 887400);
});
test('月中生效缴费规则不能套整个生效月', () => {
  assert.equal(calculatePayroll({ ...input, month: '2026-08' }, { ...rule, scope: { ...scope, validFrom: '2026-08-16' } }).ok, false);
});

test('养老金不允许确认框掩盖明显矛盾的资格、年限或日期', () => {
  for (const modified of [{ ...pension, contributionMonths: 1 }, { ...pension, contributionMonths: 721 }, { ...pension, retirementAgeMonths: 480 }, { ...pension, ruleDate: '2026-09-31' }, { ...pension, ruleDate: '2027-01-01', ruleYear: 2027 }]) assert.equal(calculatePensionScenario(modified, pensionRule).ok, false);
  assert.equal(calculateRetirement({ birthMonth: '1965-01', category: 'original-60', choice: 'statutory', contributionMonths: 722 }, retirementRule).ok, false);
});

test('基础养老金在进角边界保留十进制输入，不以浮点epsilon吞掉微小正差', () => {
  assert.equal(amount(calculatePensionScenario({ ...pension, averageContributionIndex: 1.00000000000001 }, pensionRule), 'pension-basic'), 200010);
  assert.equal(amount(calculatePensionScenario({ ...pension, averageContributionIndex: 0.99999999999999 }, pensionRule), 'pension-basic'), 200000);
});
