import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateAnnualTax, calculatePayroll, calculatePensionScenario, calculateRetirement,
  solvePensionTarget, calculateContributionPlan, calculateVerifiedPayroll, invertVerifiedNetSalary, calculateVerifiedEmployerCost,
  calculateVerifiedTakeHome, invertVerifiedTakeHome,
} from '../lib/labor-engine.ts';
import type {
  CalculationResult, PensionInput, PensionRule, PayrollInput, PayrollRule,
  RetirementCategory, RetirementRule, TaxRule, VerifiedTakeHomeInput,
} from '../lib/labor-engine.ts';
import { LABOR_SOURCES, LABOR_TAX_RULE, LABOR_PENSION_RULES, LABOR_RETIREMENT_RULE, LABOR_VERIFIED_PAYROLL_RULE, LABOR_PAYROLL_RULES, LABOR_CONTRIBUTION_RULES, LABOR_PENSION_CONTRIBUTION_ITEMS, LABOR_BENEFIT_PROVINCE_RULE } from '../lib/labor-rules.ts';
import { calculateVerifiedContributionPlan } from '../lib/labor-ledger.ts';
import { calculatePensionContributionItem } from '../lib/labor-contribution-item.ts';
import { calculateBenefitProvince, type BenefitProvinceInput, type BenefitProvincePeriod } from '../lib/labor-benefit-province.ts';

// These fixtures are authored by the independent reviewer. The synthetic contribution
// rates verify arithmetic only and must never be exported as regional policy data.
const scope = { region: '审核算术夹具', population: '普通企业职工', validFrom: '2026-01-01', validTo: '2026-12-31', verifiedOn: '2026-10-12' };
const evidence = { sourceIds: ['independent-official-evidence'], scope };
const tax: TaxRule = {
  ...evidence, id: 'independent-tax', annualDeductionCents: 6_000_000, monthlyDeductionCents: 500_000,
  brackets: [
    { upToCents: 3_600_000, rateBps: 300, quickDeductionCents: 0 },
    { upToCents: 14_400_000, rateBps: 1000, quickDeductionCents: 252_000 },
    { upToCents: 30_000_000, rateBps: 2000, quickDeductionCents: 1_692_000 },
    { upToCents: 42_000_000, rateBps: 2500, quickDeductionCents: 3_192_000 },
    { upToCents: 66_000_000, rateBps: 3000, quickDeductionCents: 5_292_000 },
    { upToCents: 96_000_000, rateBps: 3500, quickDeductionCents: 8_592_000 },
    { upToCents: null, rateBps: 4500, quickDeductionCents: 18_192_000 },
  ],
};
const payroll: PayrollRule = { ...evidence, id: 'synthetic-do-not-publish', regime: 'employee', complete: true, tax,
  contributions: [{ ...evidence, id: 'arithmetic-only', label: '算术夹具', baseMinCents: 0, baseMaxCents: 10_000_000, employeeRateBps: 1000, employerRateBps: 2000, rounding: 'half-up-cent' }],
};
const wage: PayrollInput = { month: '2026-01', grossCents: 1_000_000, contributionBases: { 'arithmetic-only': 1_000_000 }, additionalDeductionCents: 0, prior: { grossCents: 0, personalContributionCents: 0, additionalDeductionCents: 0, taxPaidCents: 0, deductionMonths: 0 }, currentDeductionMonths: 1, extraEmployerCostCents: 30_000 };
const pension: PensionRule = { ...evidence, id: 'independent-sh-formula', regime: 'employee', supportedPopulation: scope.population, baseRateBps: 100, serviceYearDecimals: 4, componentRounding: 'ceil-jiao', totalRounding: 'half-up-cent', accountDivisors: { 50: 195, 55: 170, 60: 139, 63: 117 }, supportedRetirementYears: [2026], minimumContributionMonths: 180, minimumRetirementAgeMonths: 600, maximumRetirementAgeMonths: 792 };
const pensionInput: PensionInput = { ruleYear: 2026, ruleDate: '2026-10-12', population: scope.population, benefitRegionConfirmed: true, qualificationConfirmed: true, hasTransitionalOrDeemedService: false, retirementAgeMonths: 720, contributionMonths: 240, pensionBaseCents: 1_000_000, averageContributionIndex: 1, personalAccountCents: 13_900_000, payoutYears: 20 };
const retirement: RetirementRule = { ...evidence, id: 'independent-national-retirement', scope: { ...scope, region: '中国大陆', validFrom: '2025-01-01', validTo: '2100-12-31' }, maximumFlexibleMonths: 36, finalMinimumYear: 2039,
  reforms: [
    { category: 'original-60', baseAgeMonths: 720, startBirthMonth: '1965-01', stepBirthMonths: 4, maxDelayMonths: 36 },
    { category: 'original-55', baseAgeMonths: 660, startBirthMonth: '1970-01', stepBirthMonths: 4, maxDelayMonths: 36 },
    { category: 'original-50', baseAgeMonths: 600, startBirthMonth: '1975-01', stepBirthMonths: 2, maxDelayMonths: 60 },
  ],
  minimumContributionMonthsByYear: { 2025: 180, 2026: 180, 2027: 180, 2028: 180, 2029: 180, 2030: 186, 2031: 192, 2032: 198, 2033: 204, 2034: 210, 2035: 216, 2036: 222, 2037: 228, 2038: 234, 2039: 240 },
};
function amount(result: CalculationResult, id: string) {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  const row = result.lines.find((line) => line.id === id);
  assert.ok(row, id);
  assert.ok(row.sourceIds.length && row.formula && row.scope.verifiedOn);
  return row.amountCents;
}

test('独立手算：1月税基4000、预扣120、实发8880、单位成本12300', () => {
  const r = calculatePayroll(wage, payroll);
  assert.equal(amount(r, 'taxable-cumulative'), 400_000);
  assert.equal(amount(r, 'withholding'), 12_000);
  assert.equal(amount(r, 'net'), 888_000);
  assert.equal(amount(r, 'company-cost'), 1_230_000);
});
test('独立手算：10月累计跨档，预扣为400而非120', () => {
  const r = calculatePayroll({ ...wage, month: '2026-10', prior: { ...wage.prior, grossCents: 9_000_000, personalContributionCents: 900_000, deductionMonths: 9, taxPaidCents: 108_000 } }, payroll);
  assert.equal(amount(r, 'taxable-cumulative'), 4_000_000);
  assert.equal(amount(r, 'withholding'), 40_000);
});
test('独立手算：预扣负差额不在本期退款，汇算可以退款', () => {
  assert.equal(amount(calculatePayroll({ ...wage, prior: { ...wage.prior, taxPaidCents: 50_000 } }, payroll), 'withholding'), 0);
  const r = calculateAnnualTax({ year: 2026, taxableComprehensiveIncomeCents: 12_000_000, personalContributionCents: 1_200_000, additionalDeductionCents: 0, taxPaidCents: 240_000 }, tax);
  assert.equal(amount(r, 'annual-taxable'), 4_800_000);
  assert.equal(amount(r, 'annual-tax'), 228_000);
  assert.equal(amount(r, 'annual-balance'), -12_000);
});
test('独立手算：全部个税级距临界点及一分邻点', () => {
  // Precomputed amounts at each boundary; one cent cannot change rounded tax by >1 cent.
  const vectors = [[3_600_000, 108_000], [14_400_000, 1_188_000], [30_000_000, 4_308_000], [42_000_000, 7_308_000], [66_000_000, 14_508_000], [96_000_000, 25_008_000]];
  for (const [base, expected] of vectors) for (const delta of [-1, 0, 1]) {
    const r = calculateAnnualTax({ year: 2026, taxableComprehensiveIncomeCents: base + delta + 6_000_000, personalContributionCents: 0, additionalDeductionCents: 0, taxPaidCents: 0 }, tax);
    assert.equal(amount(r, 'annual-tax'), expected);
  }
});
test('独立官方附表：三类出生月起点、分组边界及终点', () => {
  const rows: [RetirementCategory, string, number, string][] = [
    ['original-60','1965-01',721,'2025-02'], ['original-60','1965-04',721,'2025-05'], ['original-60','1965-05',722,'2025-07'], ['original-60','1976-08',755,'2039-07'], ['original-60','1976-09',756,'2039-09'],
    ['original-55','1970-01',661,'2025-02'], ['original-55','1981-08',695,'2039-07'], ['original-55','1981-09',696,'2039-09'],
    ['original-50','1975-01',601,'2025-02'], ['original-50','1975-02',601,'2025-03'], ['original-50','1975-03',602,'2025-05'], ['original-50','1984-10',659,'2039-09'], ['original-50','1984-11',660,'2039-11'],
  ];
  for (const [category, birthMonth, expectedAge, expectedMonth] of rows) {
    const r = calculateRetirement({ category, birthMonth, contributionMonths: 240, choice: 'statutory' }, retirement);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) { assert.equal(r.statutoryAgeMonths, expectedAge); assert.equal(r.statutoryRetirementMonth, expectedMonth); }
  }
});
test('独立最低年限：2030门槛186月，2039门槛240月', () => {
  const r = calculateRetirement({ category: 'original-55', birthMonth: '1974-01', contributionMonths: 185, choice: 'statutory' }, retirement);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.statutoryRetirementMonth, '2030-02'); assert.equal(r.minimumContributionMonths, 186); assert.equal(r.contributionSufficient, false); }
  const end = calculateRetirement({ category: 'original-50', birthMonth: '1984-11', contributionMonths: 239, choice: 'statutory' }, retirement);
  assert.ok(end.ok);
  if (end.ok) { assert.equal(end.minimumContributionMonths, 240); assert.equal(end.contributionSufficient, false); }
});
test('独立弹性规则：法定2031，提前2029用180、延迟2034用192', () => {
  const early = calculateRetirement({ category: 'original-60', birthMonth: '1969-10', contributionMonths: 180, choice: 'early', chosenRetirementMonth: '2029-10' }, retirement);
  const late = calculateRetirement({ category: 'original-60', birthMonth: '1969-10', contributionMonths: 192, choice: 'late', chosenRetirementMonth: '2034-01' }, retirement);
  assert.ok(early.ok); assert.ok(late.ok);
  if (early.ok && late.ok) { assert.equal(early.statutoryRetirementMonth, '2031-01'); assert.equal(early.minimumContributionMonths, 180); assert.equal(late.minimumContributionMonths, 192); }
});
test('独立退休拒算：改革前已达原龄、弹性超过36月、未知类别', () => {
  assert.equal(calculateRetirement({ category: 'original-60', birthMonth: '1964-12', contributionMonths: 240, choice: 'late', chosenRetirementMonth: '2026-01' }, retirement).ok, false);
  assert.equal(calculateRetirement({ category: 'original-60', birthMonth: '1969-10', contributionMonths: 240, choice: 'late', chosenRetirementMonth: '2034-02' }, retirement).ok, false);
  assert.equal(calculateRetirement({ category: 'female' as RetirementCategory, birthMonth: '1975-01', contributionMonths: 240, choice: 'statutory' }, retirement).ok, false);
});
test('独立养老手算：2000+1000=3000，20年窗口72万元', () => {
  const r = calculatePensionScenario(pensionInput, pension);
  assert.equal(amount(r, 'pension-basic'), 200_000);
  assert.equal(amount(r, 'pension-account'), 100_000);
  assert.equal(amount(r, 'pension-monthly'), 300_000);
  assert.equal(amount(r, 'pension-window'), 72_000_000);
});
test('独立上海舍入：基础和账户分别进角，不先合计', () => {
  const r = calculatePensionScenario({ ...pensionInput, pensionBaseCents: 1_000_005, personalAccountCents: 13_900_139 }, pension);
  assert.equal(amount(r, 'pension-basic'), 200_010);
  assert.equal(amount(r, 'pension-account'), 100_010);
  assert.equal(amount(r, 'pension-monthly'), 300_020);
});
test('独立养老金禁算：视同/过渡、未核定、非整周岁、失效日期', () => {
  for (const change of [{ hasTransitionalOrDeemedService: true }, { benefitRegionConfirmed: false }, { qualificationConfirmed: false }, { retirementAgeMonths: 721 }, { ruleDate: '2027-01-01', ruleYear: 2027 }])
    assert.equal(calculatePensionScenario({ ...pensionInput, ...change }, pension).ok, false);
});
test('审核修复回归：确认框不能覆盖不可能的年限、年龄或不存在日期', () => {
  for (const change of [{ contributionMonths: 1 }, { contributionMonths: 721 }, { retirementAgeMonths: 480 }, { ruleDate: '2026-09-31' }])
    assert.equal(calculatePensionScenario({ ...pensionInput, ...change }, pension).ok, false);
  assert.equal(calculateRetirement({ category: 'original-60', birthMonth: '1965-01', contributionMonths: 722, choice: 'statutory' }, retirement).ok, false);
});
test('独立实缴模式：超标准缴费只扣实际现金，不自动全部税前扣除', () => {
  const input = { ...wage, personalContributionCents: 150_000, deductiblePersonalContributionCents: 100_000, employerContributionCents: 200_000, contributionsConfirmed: true };
  const rule = { ...evidence, id: 'independent-verified', tax };
  const r = calculateVerifiedPayroll(input, rule);
  assert.equal(amount(r, 'withholding'), 12_000);
  assert.equal(amount(r, 'net'), 838_000);
  assert.equal(amount(r, 'company-cost'), 1_230_000);
  const inverse = invertVerifiedNetSalary(input, 838_000, { minCents: 0, maxCents: 2_000_000 }, rule);
  assert.equal(inverse.minimum, 1_000_000);
  assert.equal(calculateVerifiedPayroll({ ...input, deductiblePersonalContributionCents: 150_001 }, rule).ok, false);
  assert.equal(calculateVerifiedPayroll({ ...input, contributionsConfirmed: false }, rule).ok, false);
});
test('独立养老金逆算：账户整数分平台产生多解，并报告不可达目标', () => {
  const r = solvePensionTarget(pensionInput, 300_000, { minAccountCents: 0, maxAccountCents: 20_000_000 }, pension);
  assert.equal(r.status, 'multiple');
  assert.equal(r.minimum, 13_898_611);
  assert.equal(r.maximum, 13_900_000);
  assert.equal(solvePensionTarget(pensionInput, 199_990, { minAccountCents: 0, maxAccountCents: 20_000_000 }, pension).status, 'none');
  assert.equal(solvePensionTarget(pensionInput, 300_001, { minAccountCents: 0, maxAccountCents: 20_000_000 }, pension).status, 'none');
});
test('独立多期拒算：居民不并职工、缺失历史不回填、月份重叠', () => {
  const rule = { ...evidence, id: payroll.id, complete: true, regime: 'employee' as const, contributions: payroll.contributions };
  const segment = { id: 'x', region: scope.region, regime: 'employee' as const, from: '2026-01', to: '2026-02', bases: wage.contributionBases };
  assert.equal(calculateContributionPlan([{ ...segment, regime: 'resident' }], [rule]).ok, false);
  assert.equal(calculateContributionPlan([{ ...segment, from: '2025-12' }], [rule]).ok, false);
  assert.equal(calculateContributionPlan([segment, { ...segment, id: 'y' }], [rule]).ok, false);
});
test('真实发布数据：每个启用规则均有完整官方来源，未审核地方费率包为空', () => {
  const liveRules = [LABOR_TAX_RULE, LABOR_RETIREMENT_RULE, LABOR_VERIFIED_PAYROLL_RULE, ...LABOR_PENSION_RULES];
  for (const rule of liveRules) {
    assert.ok(rule.sourceIds.length);
    for (const id of rule.sourceIds) {
      const source = LABOR_SOURCES[id];
      assert.ok(source, `${rule.id}: unresolved source ${id}`);
      const url = new URL(source.url);
      assert.equal(url.protocol, 'https:');
      assert.ok(url.hostname.endsWith('.gov.cn'), source.url);
      assert.ok(source.title && source.authority && source.scope && source.note && source.verifiedAt);
    }
  }
  assert.equal(LABOR_PAYROLL_RULES.length, 0, '完整地方费率包开放前须进行独立重新审核');
  assert.equal(LABOR_CONTRIBUTION_RULES.length, 0, '历史/灵活缴费规则包开放前须进行独立重新审核');
});
test('真实发布数据：税表、2026上海公式与退休表对照独立金值', () => {
  const taxResult = calculateAnnualTax({ year: 2026, taxableComprehensiveIncomeCents: 12_000_000, personalContributionCents: 1_200_000, additionalDeductionCents: 0, taxPaidCents: 240_000 }, LABOR_TAX_RULE);
  assert.equal(amount(taxResult, 'annual-tax'), 228_000);
  assert.equal(LABOR_PENSION_RULES.length, 1);
  const rule = LABOR_PENSION_RULES[0];
  assert.equal(rule.scope.validFrom, '2026-08-16');
  assert.equal(rule.scope.validTo, '2031-08-15');
  const r = calculatePensionScenario({ ...pensionInput, population: rule.supportedPopulation, pensionBaseCents: 1_257_700 }, rule);
  assert.equal(amount(r, 'pension-basic'), 251_540);
  assert.equal(amount(r, 'pension-account'), 100_000);
  assert.equal(amount(r, 'pension-monthly'), 351_540);
  assert.equal(amount(r, 'pension-window'), 84_369_600);
  const boundary = calculateRetirement({ category: 'original-50', birthMonth: '1984-11', contributionMonths: 240, choice: 'statutory' }, LABOR_RETIREMENT_RULE);
  assert.ok(boundary.ok);
  if (boundary.ok) { assert.equal(boundary.statutoryRetirementMonth, '2039-11'); assert.equal(boundary.minimumContributionMonths, 240); }
});
test('真实发布数据：负数、超限、跨年及未支持工资月份均拒算', () => {
  const annual = { year: 2026, taxableComprehensiveIncomeCents: 12_000_000, personalContributionCents: 0, additionalDeductionCents: 0, taxPaidCents: 0 };
  for (const changes of [{ year: 2025 }, { year: 2027 }, { taxableComprehensiveIncomeCents: -1 }, { taxableComprehensiveIncomeCents: 100_000_000_001 }, { personalContributionCents: Number.NaN }])
    assert.equal(calculateAnnualTax({ ...annual, ...changes }, LABOR_TAX_RULE).ok, false);
  const verified = { ...wage, month: '2026-10', personalContributionCents: 0, deductiblePersonalContributionCents: 0, employerContributionCents: 0, contributionsConfirmed: true };
  for (const changes of [{ month: '2026-09' }, { month: '2027-01' }, { grossCents: -1 }, { employerContributionCents: 100_000_000_001 }])
    assert.equal(calculateVerifiedPayroll({ ...verified, ...changes }, LABOR_VERIFIED_PAYROLL_RULE).ok, false);
  const maximum = calculateVerifiedPayroll({ ...verified, grossCents: 100_000_000_000 }, LABOR_VERIFIED_PAYROLL_RULE);
  // 1,000,000,000 - 5,000 = 999,995,000; 45% less 181,920.
  assert.equal(amount(maximum, 'withholding'), 44_981_583_000);
  assert.equal(amount(maximum, 'net'), 55_018_417_000);
});
test('独立ledger：跨地区只合计支出，分制度展示且所有结果引用可解析', () => {
  const first = { id: 'review-a', region: '上海（预算）', regime: 'employee' as const, from: '2026-01', to: '2026-06', personalMonthlyCents: 200_000, employerMonthlyCents: 400_000 };
  const second = { ...first, id: 'review-b', region: '深圳（预算）', regime: 'flexible' as const, from: '2026-07', to: '2026-12', personalMonthlyCents: 250_000, employerMonthlyCents: 0 };
  const r = calculateVerifiedContributionPlan([first, second], true);
  assert.equal(amount(r, 'ledger-employee-personal'), 1_200_000);
  assert.equal(amount(r, 'ledger-employee-employer'), 2_400_000);
  assert.equal(amount(r, 'ledger-flexible-personal'), 1_500_000);
  assert.ok(r.ok);
  if (r.ok) {
    assert.ok(r.lines.every((line) => line.sourceIds.every((id) => LABOR_SOURCES[id])));
    assert.ok(r.warnings.some((warning) => warning.includes('不等于') && warning.includes('月数')));
    assert.ok(!r.lines.some((line) => line.id === 'ledger-flexible-employer'));
  }
  assert.equal(calculateVerifiedContributionPlan([first, { ...second, from: '2026-06' }], true).ok, false);
  assert.equal(calculateVerifiedContributionPlan([{ ...second, regime: 'resident' }], true).ok, false);
  assert.equal(calculateVerifiedContributionPlan([{ ...second, employerMonthlyCents: 1 }], true).ok, false);
  for (const value of [-1, 0.5, 10_000_000_001, Number.POSITIVE_INFINITY])
    assert.equal(calculateVerifiedContributionPlan([{ ...first, personalMonthlyCents: value }], true).ok, false);
  const maximum = calculateVerifiedContributionPlan([{ ...first, from: '2040-01', to: '2099-12', personalMonthlyCents: 10_000_000_000, employerMonthlyCents: 0 }], true);
  assert.equal(amount(maximum, 'ledger-employee-personal'), 7_200_000_000_000);
});

test('独立实表手算：北上浙养老单项上下限，个人单位分开且无舍入', () => {
  const vectors: [string, number, number, number][] = [
    ['bj-pension-employee-202610', 7270, 58160, 116320],
    ['bj-pension-employee-202610', 36348, 290784, 581568],
    ['bj-pension-flexible-202610', 7270, 145400, 0],
    ['bj-pension-flexible-202610', 36348, 726960, 0],
    ['sh-pension-flexible-202610', 7546, 150920, 0],
    ['sh-pension-flexible-202610', 37731, 754620, 0],
    ['zj-pension-employee-202610', 5122, 40976, 81952],
    ['zj-pension-employee-202610', 25611, 204888, 409776],
    ['zj-pension-flexible-202610', 5122, 102440, 0],
    ['zj-pension-flexible-202610', 25611, 512220, 0],
  ];
  assert.equal(LABOR_PENSION_CONTRIBUTION_ITEMS.length, 5);
  for (const [id, base, personal, employer] of vectors) {
    const rule = LABOR_PENSION_CONTRIBUTION_ITEMS.find((r) => r.id === id);
    assert.ok(rule, id);
    const result = calculatePensionContributionItem({ month: '2026-10', confirmedBaseYuan: base, populationAndBaseConfirmed: true }, rule);
    assert.equal(amount(result, `pension-contribution-${id}-personal`), personal);
    if (employer) assert.equal(amount(result, `pension-contribution-${id}-employer`), employer);
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.lines.length, employer ? 2 : 1, '不输出猜测的完整五险或灵活就业单位额');
      for (const line of result.lines) for (const sourceId of line.sourceIds) {
        const source = LABOR_SOURCES[sourceId];
        assert.ok(source?.authority && source.scope && source.verifiedAt);
        assert.ok(new URL(source.url).hostname.endsWith('.gov.cn'));
      }
    }
  }
});

test('独立拒算：养老单项不夹取基数、不默认身份、不扩展月份、不猜分以下尾差', () => {
  for (const rule of LABOR_PENSION_CONTRIBUTION_ITEMS) {
    const input = { month: '2026-10', confirmedBaseYuan: rule.minimumBaseYuan, populationAndBaseConfirmed: true };
    for (const changes of [
      { confirmedBaseYuan: rule.minimumBaseYuan - 1 }, { confirmedBaseYuan: rule.maximumBaseYuan + 1 },
      { confirmedBaseYuan: rule.minimumBaseYuan + .01 }, { confirmedBaseYuan: Number.NaN },
      { confirmedBaseYuan: Number.POSITIVE_INFINITY }, { confirmedBaseYuan: -1 },
      { month: '2026-09' }, { month: '2026-11' }, { month: '2026-13' }, { month: '2027-10' },
      { populationAndBaseConfirmed: false },
    ]) assert.equal(calculatePensionContributionItem({ ...input, ...changes }, rule).ok, false, `${rule.id}: ${JSON.stringify(changes)}`);
    assert.equal(calculatePensionContributionItem(input, undefined).ok, false);
    assert.equal(calculatePensionContributionItem(input, { ...rule, sourceIds: [] }).ok, false);
    assert.equal(calculatePensionContributionItem(input, { ...rule, personalRatePercent: 8.001 }).ok, false);
    assert.equal(calculatePensionContributionItem(input, { ...rule, scope: { ...rule.scope, validFrom: '2026-10-02' } }).ok, false);
  }
});

test('独立规则健壮性：无效日期、倒置边界与灵活就业虚构单位费率拒算', () => {
  const rule = LABOR_PENSION_CONTRIBUTION_ITEMS[0];
  const input = { month: '2026-10', confirmedBaseYuan: 7270, populationAndBaseConfirmed: true };
  for (const changes of [
    { minimumBaseYuan: -1 }, { minimumBaseYuan: 40000 }, { maximumBaseYuan: Number.POSITIVE_INFINITY },
    { regime: 'flexible' as const, employerRatePercent: 16 },
    { scope: { ...rule.scope, validFrom: '2026-09-31' } },
    { scope: { ...rule.scope, validTo: '2026-10-32' } },
    { scope: { ...rule.scope, verifiedOn: '2026-02-30' } },
  ]) assert.equal(calculatePensionContributionItem(input, { ...rule, ...changes }).ok, false);
});

const recognized = (id: string, province: string, from: string, to: string, months: number): BenefitProvincePeriod => ({ id, province, from, to, recognizedMonths: months, accountKind: 'ordinary' });
const benefitInput: BenefitProvinceInput = {
  asOfDate: '2026-10-12', householdProvince: '浙江', ordinaryRelationshipProvince: '上海', currentParticipationProvince: '上海', currentAccountKind: 'ordinary',
  recordsConfirmed: true, eligibilityConfirmed: true, hasSpecialCircumstances: false, temporaryHandlingConfirmed: false,
  periods: [recognized('bj', '北京', '2000-01', '2009-12', 120), recognized('sh', '上海', '2010-01', '2026-09', 120)],
};
function checkBenefit(input: BenefitProvinceInput, expected: string, branch: string) {
  const result = calculateBenefitProvince(input, LABOR_BENEFIT_PROVINCE_RULE);
  assert.ok(result.ok, JSON.stringify(result));
  if (!result.ok) return;
  assert.equal(result.benefitProvince, expected);
  assert.equal(result.branch, branch);
  for (const sourceId of [...result.sourceIds, ...result.steps.flatMap((s) => s.sourceIds)]) {
    const source = LABOR_SOURCES[sourceId];
    assert.ok(source?.verifiedAt && source.authority && source.scope);
    assert.ok(new URL(source.url).hostname.endsWith('.gov.cn'));
  }
}
test('独立真实领取省：户籍优先、119/120与从未参保户籍兜底', () => {
  checkBenefit(benefitInput, '上海', 'current-ten-years');
  const less = { ...benefitInput, periods: [benefitInput.periods[0], { ...benefitInput.periods[1], recognizedMonths: 119 }] };
  checkBenefit(less, '北京', 'last-ten-years');
  checkBenefit({ ...less, householdProvince: '上海' }, '上海', 'household-relationship');
  checkBenefit({ ...less, periods: [{ ...less.periods[0], recognizedMonths: 90 }, less.periods[1]] }, '浙江', 'household-fallback');
});
test('独立真实领取省：同省往返累计并取最近关系，不按最长月数或输入顺序', () => {
  const history = [recognized('bj1', '北京', '1990-01', '1994-12', 60), recognized('sh1', '上海', '1995-01', '2014-12', 240), recognized('bj2', '北京', '2015-01', '2019-12', 60), recognized('zj1', '浙江', '2020-01', '2026-09', 81)];
  const input = { ...benefitInput, householdProvince: '江苏', ordinaryRelationshipProvince: '浙江', currentParticipationProvince: '浙江', periods: history };
  checkBenefit(input, '北京', 'last-ten-years');
  checkBenefit({ ...input, periods: [...history].reverse() }, '北京', 'last-ten-years');
  checkBenefit({ ...input, periods: [recognized('sh1', '上海', '2000-01', '2009-12', 120), recognized('hz', '浙江', '2010-01', '2014-12', 60), recognized('wz', '浙江', '2015-01', '2019-12', 60)] }, '浙江', 'current-ten-years');
});
test('独立领取省拒算：临时120月、未知性质、市级冒充省、未确认、特殊及未来日期', () => {
  for (const changes of [
    { householdProvince: '温州' }, { recordsConfirmed: false }, { eligibilityConfirmed: false }, { hasSpecialCircumstances: true },
    { currentAccountKind: 'unknown' as const }, { currentAccountKind: 'temporary' as const, temporaryHandlingConfirmed: true },
    { ordinaryRelationshipProvince: '北京' }, { asOfDate: '2030-10-12' },
    { periods: [benefitInput.periods[0], { ...benefitInput.periods[1], accountKind: 'temporary' as const }] },
    { periods: [{ ...benefitInput.periods[0], recognizedMonths: 60 }, { ...benefitInput.periods[1], recognizedMonths: 119 }] },
    { periods: [benefitInput.periods[0], { ...benefitInput.periods[1], from: '2009-12' }] },
    { periods: [benefitInput.periods[0], { ...benefitInput.periods[1], recognizedMonths: 119.9 }] },
  ]) assert.equal(calculateBenefitProvince({ ...benefitInput, ...changes }, LABOR_BENEFIT_PROVINCE_RULE).ok, false, JSON.stringify(changes));
});

test('独立公司成本金值：10000.01+2222.22+0.03=12222.26，不重复计入个人扣款', () => {
  const input = { month: '2026-10', grossCents: 1_000_001, employerContributionCents: 222_222, extraEmployerCostCents: 3, contributionsConfirmed: true };
  const result = calculateVerifiedEmployerCost(input, LABOR_VERIFIED_PAYROLL_RULE);
  assert.equal(amount(result, 'company-cost'), 1_222_226);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.lines.length, 4);
    assert.ok(!result.lines.some((row) => ['net', 'withholding', 'personal-total'].includes(row.id)));
    for (const row of result.lines) {
      assert.deepEqual(new Set(row.sourceIds), new Set(['social-insurance-law', 'housing-fund-2026']));
      assert.equal(row.scope.population, LABOR_VERIFIED_PAYROLL_RULE.employerCostScope!.population);
      for (const id of row.sourceIds) assert.ok(LABOR_SOURCES[id]?.url && LABOR_SOURCES[id].verifiedAt);
    }
  }
  assert.equal(amount(calculateVerifiedEmployerCost({ ...input, grossCents: 0, employerContributionCents: 1, extraEmployerCostCents: 0 }, LABOR_VERIFIED_PAYROLL_RULE), 'company-cost'), 1);
});

test('独立公司成本边界：空缺/非法金额不补零，未确认与非Q4不计算', () => {
  const input = { month: '2026-12', grossCents: 1_000_000, employerContributionCents: 200_000, extraEmployerCostCents: 30_000, contributionsConfirmed: true };
  for (const field of ['grossCents', 'employerContributionCents', 'extraEmployerCostCents'] as const) {
    for (const invalid of [undefined, -1, .01, Number.NaN, Number.POSITIVE_INFINITY, 100_000_000_001]) {
      assert.equal(calculateVerifiedEmployerCost({ ...input, [field]: invalid }, LABOR_VERIFIED_PAYROLL_RULE).ok, false);
    }
  }
  for (const patch of [{ contributionsConfirmed: false }, { month: '2026-09' }, { month: '2027-01' }, { month: '' }])
    assert.equal(calculateVerifiedEmployerCost({ ...input, ...patch }, LABOR_VERIFIED_PAYROLL_RULE).ok, false);
  assert.equal(amount(calculateVerifiedEmployerCost(input, LABOR_VERIFIED_PAYROLL_RULE), 'company-cost'), 1_230_000);
});

test('独立公司成本隔离：不读取个人税表/累计背景，缺专用证据仍拒算', () => {
  const input = { month: '2026-10', grossCents: 1_000_000, employerContributionCents: 200_000, extraEmployerCostCents: 0, contributionsConfirmed: true };
  const rule = { ...LABOR_VERIFIED_PAYROLL_RULE };
  Object.defineProperty(rule, 'tax', { get() { throw new Error('不得借用税表'); } });
  Object.defineProperty(rule, 'scope', { get() { throw new Error('不得借用税务人群'); } });
  Object.defineProperty(input, 'prior', { get() { throw new Error('不得读取或构造累计个税背景'); } });
  assert.equal(amount(calculateVerifiedEmployerCost(input, rule), 'company-cost'), 1_200_000);
  for (const patch of [
    { employerCostScope: undefined }, { employerCostSourceIds: [] }, { employerCostSourceIds: ['unregistered'] },
    { employerCostScope: { ...LABOR_VERIFIED_PAYROLL_RULE.employerCostScope!, validFrom: '2026-10-02' } },
    { employerCostScope: { ...LABOR_VERIFIED_PAYROLL_RULE.employerCostScope!, verifiedOn: '2026-02-30' } },
  ]) assert.equal(calculateVerifiedEmployerCost(input, { ...LABOR_VERIFIED_PAYROLL_RULE, ...patch }).ok, false);
});

// Independently derived, different cumulative context from the implementation author's vectors.
const personalOnlyGolden: VerifiedTakeHomeInput = {
  month: '2026-10', grossCents: 2_200_000, personalContributionCents: 250_000,
  deductiblePersonalContributionCents: 200_000, additionalDeductionCents: 100_000,
  prior: { grossCents: 8_100_000, personalContributionCents: 600_000, additionalDeductionCents: 600_000, taxPaidCents: 72_000, deductionMonths: 9 },
  currentDeductionMonths: 1, contributionsConfirmed: true,
};
test('独立到手金值：跨36000税档，累计38000税1280，扣560，到手18940', () => {
  const result = calculateVerifiedTakeHome(personalOnlyGolden, LABOR_VERIFIED_PAYROLL_RULE);
  // (81000 + 22000) - (6000 + 2000) - (6000 + 1000) - 50000 = 38000.
  // 38000 * 10% - 2520 = 1280; 1280 - 720 = 560; 22000 - 2500 - 560 = 18940.
  assert.equal(amount(result, 'taxable-cumulative'), 3_800_000);
  assert.equal(amount(result, 'withholding'), 56_000);
  assert.equal(amount(result, 'net'), 1_894_000);
  assert.ok(result.ok);
  if (result.ok) {
    assert.ok(!result.lines.some((row) => ['employer-total', 'employer-extra', 'company-cost'].includes(row.id)));
    for (const row of result.lines) {
      assert.ok(row.formula && row.scope.population && row.scope.validFrom && row.scope.validTo && row.scope.verifiedOn);
      for (const id of row.sourceIds) assert.ok(LABOR_SOURCES[id]?.url && LABOR_SOURCES[id].verifiedAt);
    }
  }
});

test('独立到手正逆隔离及未知拒算：抛错单位字段不访问，累计和减除月不得补零', () => {
  const input = { ...personalOnlyGolden };
  for (const field of ['employerContributionCents', 'extraEmployerCostCents']) Object.defineProperty(input, field, {
    enumerable: true, get() { throw new Error('独立到手入口不得读取单位金额'); },
  });
  assert.equal(amount(calculateVerifiedTakeHome(input, LABOR_VERIFIED_PAYROLL_RULE), 'net'), 1_894_000);
  const inverse = invertVerifiedTakeHome(input, 1_894_000, { minCents: 0, maxCents: 3_000_000 }, LABOR_VERIFIED_PAYROLL_RULE);
  assert.ok(inverse.status === 'unique' || inverse.status === 'multiple', JSON.stringify(inverse));
  assert.ok(inverse.minimum !== undefined && inverse.maximum !== undefined);
  assert.ok(inverse.minimum <= 2_200_000 && inverse.maximum >= 2_200_000);
  for (const grossCents of [inverse.minimum, inverse.maximum]) assert.equal(amount(calculateVerifiedTakeHome({ ...personalOnlyGolden, grossCents }, LABOR_VERIFIED_PAYROLL_RULE), 'net'), 1_894_000);
  for (const patch of [
    { currentDeductionMonths: undefined }, { currentDeductionMonths: 0 }, { contributionsConfirmed: false },
    { prior: undefined }, { month: '2026-09' }, { deductiblePersonalContributionCents: 250_001 },
    { personalContributionCents: undefined }, { additionalDeductionCents: undefined },
  ]) assert.equal(calculateVerifiedTakeHome({ ...personalOnlyGolden, ...patch } as VerifiedTakeHomeInput, LABOR_VERIFIED_PAYROLL_RULE).ok, false);
});
