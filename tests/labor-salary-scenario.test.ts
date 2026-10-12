import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFixedSalaryScenario, type FixedSalaryScenarioInput } from '../lib/labor-salary-scenario.ts';
import { calculateVerifiedTakeHome, type CalculationResult } from '../lib/labor-engine.ts';
import { LABOR_VERIFIED_PAYROLL_RULE } from '../lib/labor-rules.ts';

const input: FixedSalaryScenarioInput = { month: '2026-10', grossCents: 950_000, personalContributionCents: 100_000, scenarioConfirmed: true };
function amount(result: CalculationResult, id: string): number {
  assert.ok(result.ok, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  const row = result.lines.find((item) => item.id === id); assert.ok(row); return row.amountCents;
}

test('固定9500工资/1000缴费：10月至12月跨档，当月105/280/350而非年税平均', () => {
  for (const [month, tax, cumulative, prior] of [
    ['2026-10', 10_500, 105_000, 94_500],
    ['2026-11', 28_000, 133_000, 105_000],
    ['2026-12', 35_000, 168_000, 133_000],
  ] as const) {
    const result = calculateFixedSalaryScenario({ ...input, month }, LABOR_VERIFIED_PAYROLL_RULE);
    assert.equal(amount(result, 'withholding'), tax);
    assert.equal(amount(result, 'scenario-prior-tax'), prior);
    assert.equal(amount(result, 'scenario-cumulative-tax'), cumulative);
    assert.equal(amount(result, 'net'), 850_000 - tax);
  }
});
test('10月恰好跨36000级距：此前1080、本月400、累计1480，与精确累计API一致', () => {
  const scenario = calculateFixedSalaryScenario({ ...input, grossCents: 1_000_000 }, LABOR_VERIFIED_PAYROLL_RULE);
  const precise = calculateVerifiedTakeHome({
    month: '2026-10', grossCents: 1_000_000, personalContributionCents: 100_000, deductiblePersonalContributionCents: 100_000,
    additionalDeductionCents: 0, contributionsConfirmed: true, currentDeductionMonths: 1,
    prior: { grossCents: 9_000_000, personalContributionCents: 900_000, additionalDeductionCents: 0, taxPaidCents: 108_000, deductionMonths: 9 },
  }, LABOR_VERIFIED_PAYROLL_RULE);
  assert.equal(amount(scenario, 'scenario-prior-tax'), 108_000);
  assert.equal(amount(scenario, 'scenario-cumulative-tax'), 148_000);
  for (const id of ['taxable-cumulative', 'withholding', 'net']) assert.equal(amount(scenario, id), amount(precise, id));
});
test('先把两次累计税各取分再相减：5000.05元的10月税1分，11/12月0分', () => {
  for (const [month, tax] of [['2026-10', 1], ['2026-11', 0], ['2026-12', 0]] as const) {
    const result = calculateFixedSalaryScenario({ ...input, month, grossCents: 500_005, personalContributionCents: 0 }, LABOR_VERIFIED_PAYROLL_RULE);
    assert.equal(amount(result, 'withholding'), tax);
    assert.equal(amount(result, 'scenario-cumulative-tax'), 2);
  }
});
test('零工资零缴费、恰好全部实扣、费用扣除后零税基保持零税，不制造单位输入', () => {
  for (const [gross, personal, net] of [[0, 0, 0], [100_000, 100_000, 0], [600_000, 100_000, 500_000]]) {
    const result = calculateFixedSalaryScenario({ ...input, grossCents: gross, personalContributionCents: personal }, LABOR_VERIFIED_PAYROLL_RULE);
    assert.equal(amount(result, 'withholding'), 0); assert.equal(amount(result, 'net'), net);
  }
  const personalOnly = { ...input };
  for (const key of ['employerContributionCents', 'extraEmployerCostCents', 'prior', 'additionalDeductionCents']) Object.defineProperty(personalOnly, key, {
    enumerable: true, get() { throw new Error('simplified scenario must not read unrelated input'); },
  });
  const result = calculateFixedSalaryScenario(personalOnly, LABOR_VERIFIED_PAYROLL_RULE);
  assert.equal(amount(result, 'net'), 839_500);
  if (result.ok) assert.ok(result.lines.every((row) => !row.id.includes('employer') && row.id !== 'company-cost'));
});
test('缺确认、期间外、非法分、超工资实扣、累计金额越界拒算', () => {
  for (const variant of [
    { ...input, scenarioConfirmed: false }, { ...input, scenarioConfirmed: undefined },
    ...['2026-01', '2026-09', '2026-13', '2027-10', '2026-10-01'].map((month) => ({ ...input, month })),
    ...[-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 100_000_000_000].map((grossCents) => ({ ...input, grossCents })),
    ...[-1, 0.5, NaN, Infinity, 950_001].map((personalContributionCents) => ({ ...input, personalContributionCents })),
    { ...input, grossCents: 0, personalContributionCents: 1 },
  ]) assert.equal(calculateFixedSalaryScenario(variant as FixedSalaryScenarioInput, LABOR_VERIFIED_PAYROLL_RULE).ok, false);
});
test('缺来源、税表不完整、日期无效、税规则不足以覆盖1月或减除口径不同拒算', () => {
  const rule = LABOR_VERIFIED_PAYROLL_RULE;
  for (const changed of [
    { ...rule, sourceIds: [] },
    { ...rule, tax: { ...rule.tax, sourceIds: [] } },
    { ...rule, tax: { ...rule.tax, brackets: [] } },
    { ...rule, scope: { ...rule.scope, validTo: '2026-11-31' } },
    { ...rule, tax: { ...rule.tax, scope: { ...rule.tax.scope, validFrom: '2026-02-01' } } },
    { ...rule, tax: { ...rule.tax, monthlyDeductionCents: 0 } },
  ]) assert.equal(calculateFixedSalaryScenario(input, changed).ok, false);
});
test('全部金额可追溯且情景标签明确，计算不变更输入或规则', () => {
  const beforeInput = structuredClone(input), beforeRule = structuredClone(LABOR_VERIFIED_PAYROLL_RULE);
  const result = calculateFixedSalaryScenario(input, LABOR_VERIFIED_PAYROLL_RULE);
  assert.ok(result.ok);
  if (result.ok) {
    assert.ok(result.warnings.some((text) => text.includes('足额预扣')));
    assert.ok(result.warnings.some((text) => text.includes('不是实际工资单预测')));
    assert.ok(result.lines.every((row) => row.sourceIds.length > 0 && row.scope.validFrom && row.formula));
    assert.ok(result.lines.find((row) => row.id === 'net')?.label.includes('情景'));
    assert.deepEqual(result.lines.find((row) => row.id === 'scenario-prior-tax')?.sourceIds, LABOR_VERIFIED_PAYROLL_RULE.tax.sourceIds);
  }
  assert.deepEqual(input, beforeInput); assert.deepEqual(LABOR_VERIFIED_PAYROLL_RULE, beforeRule);
});
