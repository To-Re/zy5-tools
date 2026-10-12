import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateVerifiedTakeHome, invertVerifiedTakeHome, calculateVerifiedPayroll, type VerifiedTakeHomeInput, type CalculationResult } from '../lib/labor-engine.ts';
import { LABOR_VERIFIED_PAYROLL_RULE } from '../lib/labor-rules.ts';

const input: VerifiedTakeHomeInput = {
  month: '2026-10', grossCents: 1_000_000, personalContributionCents: 100_000,
  deductiblePersonalContributionCents: 80_000, additionalDeductionCents: 0,
  prior: { grossCents: 9_000_000, personalContributionCents: 720_000, additionalDeductionCents: 0, taxPaidCents: 126_000, deductionMonths: 9 },
  currentDeductionMonths: 1, contributionsConfirmed: true,
};
function amount(result: CalculationResult, id: string): number {
  assert.ok(result.ok, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  const row = result.lines.find((item) => item.id === id); assert.ok(row); return row.amountCents;
}

test('到手独立黄金样例：累计税基42000，应纳1680，前缴1260，本期420，到手8580', () => {
  const result = calculateVerifiedTakeHome(input, LABOR_VERIFIED_PAYROLL_RULE);
  assert.equal(amount(result, 'taxable-cumulative'), 4_200_000);
  assert.equal(amount(result, 'withholding'), 42_000);
  assert.equal(amount(result, 'net'), 858_000);
  if (result.ok) {
    assert.deepEqual(result.lines.map((row) => row.id), ['gross', 'personal-total', 'personal-deductible', 'taxable-cumulative', 'withholding', 'net']);
    assert.ok(result.lines.every((row) => row.sourceIds.length && row.formula && row.scope.population));
  }
});
test('正反向只读取个人字段，单位字段getters不可访问', () => {
  const personalOnly = { ...input };
  for (const key of ['employerContributionCents', 'extraEmployerCostCents']) Object.defineProperty(personalOnly, key, {
    enumerable: true, get() { throw new Error('Take-home must not read employer fields.'); },
  });
  assert.equal(amount(calculateVerifiedTakeHome(personalOnly, LABOR_VERIFIED_PAYROLL_RULE), 'net'), 858_000);
  const inverse = invertVerifiedTakeHome(personalOnly, 858_000, { minCents: 0, maxCents: 5_000_000 }, LABOR_VERIFIED_PAYROLL_RULE);
  assert.notEqual(inverse.status, 'blocked'); assert.ok(inverse.minimum !== undefined);
  assert.equal(amount(calculateVerifiedTakeHome({ ...input, grossCents: inverse.minimum }, LABOR_VERIFIED_PAYROLL_RULE), 'net'), 858_000);
});
test('不把超标准实扣当合法扣除；当期不退负预扣差额', () => {
  const result = calculateVerifiedTakeHome({ ...input, prior: { ...input.prior, taxPaidCents: 999_999 } }, LABOR_VERIFIED_PAYROLL_RULE);
  assert.equal(amount(result, 'withholding'), 0); assert.equal(amount(result, 'net'), 900_000);
  assert.equal(calculateVerifiedTakeHome({ ...input, deductiblePersonalContributionCents: 100_001 }, LABOR_VERIFIED_PAYROLL_RULE).ok, false);
});
test('新旧入口共用预扣逻辑，单位输入变化不改变个人金额', () => {
  const focused = calculateVerifiedTakeHome(input, LABOR_VERIFIED_PAYROLL_RULE);
  for (const employer of [0, 100_000, 999_999]) {
    const combined = calculateVerifiedPayroll({ ...input, employerContributionCents: employer, extraEmployerCostCents: 50_000 }, LABOR_VERIFIED_PAYROLL_RULE);
    for (const id of ['personal-total', 'personal-deductible', 'taxable-cumulative', 'withholding', 'net']) assert.equal(amount(combined, id), amount(focused, id));
    assert.equal(amount(combined, 'company-cost'), 1_050_000 + employer);
  }
});
test('缺累计背景、未确认、期间外、非法金额拒算，反推不可达明确无解', () => {
  assert.equal(calculateVerifiedTakeHome({ ...input, prior: undefined } as unknown as VerifiedTakeHomeInput, LABOR_VERIFIED_PAYROLL_RULE).ok, false);
  for (const variant of [{ ...input, contributionsConfirmed: false }, { ...input, month: '2027-01' }, { ...input, grossCents: -1 }, { ...input, personalContributionCents: 0.1 }, { ...input, currentDeductionMonths: 2 }]) {
    assert.equal(calculateVerifiedTakeHome(variant, LABOR_VERIFIED_PAYROLL_RULE).ok, false);
  }
  assert.equal(invertVerifiedTakeHome(input, 999_999_999, { minCents: 0, maxCents: 2_000_000 }, LABOR_VERIFIED_PAYROLL_RULE).status, 'none');
});
