import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFixedSalaryScenario } from '../lib/labor-salary-scenario.ts';
import { LABOR_VERIFIED_PAYROLL_RULE, LABOR_SOURCES } from '../lib/labor-rules.ts';
import type { CalculationResult } from '../lib/labor-engine.ts';

// Independent hand-derived vectors from the seven progressive brackets.
// This file does not import the implementation's tax helper or its test fixtures.
const base = { month: '2026-10', grossCents: 950000, personalContributionCents: 100000, scenarioConfirmed: true };
function amount(result: CalculationResult, id: string): number {
  assert.ok(result.ok, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  const line = result.lines.find((line) => line.id === id); assert.ok(line, id); return line.amountCents;
}
test('独立固定工资：同额情景跨36000档，不是年度1680元税额除12', () => {
  for (const [month, prior, cumulative, withheld, net] of [
    ['2026-10', 94500, 105000, 10500, 839500],
    ['2026-11', 105000, 133000, 28000, 822000],
    ['2026-12', 133000, 168000, 35000, 815000],
  ] as const) {
    const result = calculateFixedSalaryScenario({ ...base, month }, LABOR_VERIFIED_PAYROLL_RULE);
    assert.equal(amount(result, 'scenario-prior-tax'), prior);
    assert.equal(amount(result, 'scenario-cumulative-tax'), cumulative);
    assert.equal(amount(result, 'withholding'), withheld);
    assert.equal(amount(result, 'net'), net);
    assert.notEqual(withheld, 14000);
  }
});
test('独立固定工资：跨其余五个税档，前后累计税分别手算', () => {
  // A is monthly taxable amount after the fixed 5000 deduction and zero personal contribution.
  for (const [a, prior, cumulative, withheld] of [
    [15000, 10980, 13080, 2100], // 135000 -> 150000
    [31000, 38880, 45580, 6700], // 279000 -> 310000
    [45000, 69330, 82080, 12750], // 405000 -> 450000
    [70000, 136080, 159080, 23000], // 630000 -> 700000
    [100000, 229080, 268080, 39000], // 900000 -> 1000000
  ]) {
    const result = calculateFixedSalaryScenario({ ...base, grossCents: (a + 5000) * 100, personalContributionCents: 0 }, LABOR_VERIFIED_PAYROLL_RULE);
    assert.equal(amount(result, 'scenario-prior-tax'), prior * 100);
    assert.equal(amount(result, 'scenario-cumulative-tax'), cumulative * 100);
    assert.equal(amount(result, 'withholding'), withheld * 100);
  }
});
test('独立固定工资：分别累计取分后相减，半分边界不按月另取整', () => {
  for (const [month, previous, total, withheld] of [['2026-10', 1, 2, 1], ['2026-11', 2, 2, 0], ['2026-12', 2, 2, 0]] as const) {
    const result = calculateFixedSalaryScenario({ ...base, month, grossCents: 500005, personalContributionCents: 0 }, LABOR_VERIFIED_PAYROLL_RULE);
    assert.equal(amount(result, 'scenario-prior-tax'), previous);
    assert.equal(amount(result, 'scenario-cumulative-tax'), total);
    assert.equal(amount(result, 'withholding'), withheld);
    assert.equal(amount(result, 'net'), 500005 - withheld);
  }
});
test('独立固定工资：零和5000临界均非负税额，不伪造未知0', () => {
  for (const [grossCents, personalContributionCents] of [[0, 0], [500000, 0], [600000, 100000], [100000, 100000]]) {
    const result = calculateFixedSalaryScenario({ ...base, grossCents, personalContributionCents }, LABOR_VERIFIED_PAYROLL_RULE);
    assert.equal(amount(result, 'withholding'), 0);
    assert.equal(amount(result, 'net'), grossCents - personalContributionCents);
  }
  for (const patch of [{ scenarioConfirmed: false }, { scenarioConfirmed: undefined }, { grossCents: undefined }, { personalContributionCents: undefined }, { grossCents: -1 }, { grossCents: 1.1 }, { personalContributionCents: NaN }, { grossCents: Infinity }, { personalContributionCents: 950001 }, { grossCents: Number.MAX_SAFE_INTEGER }]) assert.equal(calculateFixedSalaryScenario({ ...base, ...patch } as typeof base, LABOR_VERIFIED_PAYROLL_RULE).ok, false);
});
test('独立固定工资：Q4及全年税规则证据必须覆盖，不能借当前月补造前月', () => {
  for (const month of ['2026-01', '2026-09', '2027-10', '2026-13', '2026-1', '']) assert.equal(calculateFixedSalaryScenario({ ...base, month }, LABOR_VERIFIED_PAYROLL_RULE).ok, false);
  const restricted = { ...LABOR_VERIFIED_PAYROLL_RULE, tax: { ...LABOR_VERIFIED_PAYROLL_RULE.tax, scope: { ...LABOR_VERIFIED_PAYROLL_RULE.tax.scope, validFrom: '2026-02-01' } } };
  assert.equal(calculateFixedSalaryScenario(base, restricted).ok, false);
  assert.equal(calculateFixedSalaryScenario(base, { ...LABOR_VERIFIED_PAYROLL_RULE, sourceIds: [] }).ok, false);
});
test('独立固定工资：真实累计及单位字段不读取，每项仍有规则追溯和固定情景提示', () => {
  const input = { ...base };
  for (const key of ['prior', 'employerContributionCents', 'extraEmployerCostCents', 'additionalDeductionCents']) Object.defineProperty(input, key, { get() { throw new Error('固定情景不能读隐藏真实背景'); } });
  const result = calculateFixedSalaryScenario(input, LABOR_VERIFIED_PAYROLL_RULE);
  assert.equal(amount(result, 'net'), 839500);
  if (result.ok) {
    assert.match(result.warnings.join(' '), /情景/);
    for (const line of result.lines) {
      assert.ok(line.formula); assert.ok(line.scope.population); assert.ok(line.scope.validFrom); assert.ok(line.scope.verifiedOn);
      assert.ok(line.sourceIds.length); for (const id of line.sourceIds) assert.ok(LABOR_SOURCES[id]?.url, id);
    }
  }
  assert.equal(input.grossCents, 950000); assert.equal(input.personalContributionCents, 100000);
});
