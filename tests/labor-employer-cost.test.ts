import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateVerifiedEmployerCost, type CalculationResult, type VerifiedEmployerCostInput, type VerifiedPayrollRule } from '../lib/labor-engine.ts';
import { LABOR_VERIFIED_PAYROLL_RULE } from '../lib/labor-rules.ts';

const input: VerifiedEmployerCostInput = {
  month: '2026-10', grossCents: 1_500_000, employerContributionCents: 400_000,
  extraEmployerCostCents: 50_000, contributionsConfirmed: true,
};
function amount(result: CalculationResult, id: string): number {
  assert.ok(result.ok, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  const row = result.lines.find((item) => item.id === id);
  assert.ok(row); return row.amountCents;
}

test('公司成本独立手算15000+4000+500=19500，无个人扣款或个税背景', () => {
  const result = calculateVerifiedEmployerCost(input, LABOR_VERIFIED_PAYROLL_RULE);
  assert.equal(amount(result, 'company-cost'), 1_950_000);
  assert.equal(amount(result, 'gross'), 1_500_000);
  assert.equal(amount(result, 'employer-total'), 400_000);
  assert.equal(amount(result, 'employer-extra'), 50_000);
  if (result.ok) for (const row of result.lines) {
    assert.deepEqual(row.sourceIds, ['social-insurance-law', 'housing-fund-2026']);
    assert.ok(row.formula); assert.equal(row.scope.validFrom, '2026-10-01');
    assert.ok(!row.sourceIds.some((id) => id.startsWith('iit')));
  }
});
test('单位成本入口不访问税法规则或个人税字段', () => {
  const noTaxAccess = { ...LABOR_VERIFIED_PAYROLL_RULE };
  Object.defineProperty(noTaxAccess, 'scope', { get() { throw new Error('Employer-only calculation must not inherit tax population scope.'); } });
  Object.defineProperty(noTaxAccess, 'tax', { get() { throw new Error('Employer-only calculation must not read tax.'); } });
  assert.equal(amount(calculateVerifiedEmployerCost(input, noTaxAccess), 'company-cost'), 1_950_000);
  const result = calculateVerifiedEmployerCost({ ...input, grossCents: 0, employerContributionCents: 0, extraEmployerCostCents: 0 }, noTaxAccess);
  assert.equal(amount(result, 'company-cost'), 0);
});
test('单位成本真实规则仅覆盖2026年10—12月，非法年月拒算', () => {
  for (const month of ['2026-00', '2026-13', '2026-10-31', '2026-9', '', '2026-09', '2027-01']) {
    assert.equal(calculateVerifiedEmployerCost({ ...input, month }, LABOR_VERIFIED_PAYROLL_RULE).ok, false, month);
  }
  for (const month of ['2026-10', '2026-11', '2026-12']) assert.equal(calculateVerifiedEmployerCost({ ...input, month }, LABOR_VERIFIED_PAYROLL_RULE).ok, true);
});
test('未确认、缺来源或来源不属于规则时拒算', () => {
  assert.equal(calculateVerifiedEmployerCost({ ...input, contributionsConfirmed: false }, LABOR_VERIFIED_PAYROLL_RULE).ok, false);
  for (const rule of [
    { ...LABOR_VERIFIED_PAYROLL_RULE, sourceIds: [] },
    { ...LABOR_VERIFIED_PAYROLL_RULE, employerCostSourceIds: [] },
    { ...LABOR_VERIFIED_PAYROLL_RULE, employerCostSourceIds: undefined },
    { ...LABOR_VERIFIED_PAYROLL_RULE, employerCostSourceIds: ['unverified-source'] },
    { ...LABOR_VERIFIED_PAYROLL_RULE, employerCostSourceIds: [''] },
  ]) assert.equal(calculateVerifiedEmployerCost(input, rule).ok, false);
});
test('范围与有效日缺失、非法或月中变化拒算', () => {
  const variants: VerifiedPayrollRule[] = [
    { ...LABOR_VERIFIED_PAYROLL_RULE, employerCostScope: { ...LABOR_VERIFIED_PAYROLL_RULE.employerCostScope!, region: '' } },
    { ...LABOR_VERIFIED_PAYROLL_RULE, employerCostScope: { ...LABOR_VERIFIED_PAYROLL_RULE.employerCostScope!, population: '' } },
    { ...LABOR_VERIFIED_PAYROLL_RULE, employerCostScope: { ...LABOR_VERIFIED_PAYROLL_RULE.employerCostScope!, verifiedOn: '2026-09-31' } },
    { ...LABOR_VERIFIED_PAYROLL_RULE, employerCostScope: { ...LABOR_VERIFIED_PAYROLL_RULE.employerCostScope!, validFrom: '2026-10-16' } },
  ];
  variants.push({ ...LABOR_VERIFIED_PAYROLL_RULE, employerCostScope: undefined });
  for (const rule of variants) assert.equal(calculateVerifiedEmployerCost(input, rule).ok, false);
});
test('负金额、非整数分、无穷大、安全整数溢出和10亿元输入上限拒算', () => {
  for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, 100_000_000_001]) {
    for (const key of ['grossCents', 'employerContributionCents', 'extraEmployerCostCents'] as const) {
      assert.equal(calculateVerifiedEmployerCost({ ...input, [key]: value }, LABOR_VERIFIED_PAYROLL_RULE).ok, false, `${key}=${value}`);
    }
  }
  assert.equal(amount(calculateVerifiedEmployerCost({ ...input, grossCents: 100_000_000_000, employerContributionCents: 100_000_000_000, extraEmployerCostCents: 100_000_000_000 }, LABOR_VERIFIED_PAYROLL_RULE), 'company-cost'), 300_000_000_000);
});
