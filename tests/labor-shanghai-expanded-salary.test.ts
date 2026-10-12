import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAutoContributionScenario, type AutoContributionScenarioInput } from '../lib/labor-auto-scenario.ts';
import { calculateFrozenSalaryComparison, type FrozenSalaryComparisonInput } from '../lib/labor-frozen-salary.ts';
import { LABOR_AUTO_CONTRIBUTION_RULES, LABOR_FROZEN_SALARY_RULES } from '../lib/labor-rules.ts';

const rule = LABOR_FROZEN_SALARY_RULES.find((entry) => entry.city === 'shanghai')!;
const input: FrozenSalaryComparisonInput = { city: 'shanghai', month: '2026-10', grossCents: 1000000,
  priorAverageWageCents: 1000000, housingRateBps: 500, assumptions: 'ordinary-employee-no-special-cases', frozenComparisonConfirmed: true };
function auto(patch: Partial<AutoContributionScenarioInput> = {}) { return calculateAutoContributionScenario({ ...input, ...patch }, LABOR_AUTO_CONTRIBUTION_RULES); }
function frozen(patch: Partial<FrozenSalaryComparisonInput> = {}) { return calculateFrozenSalaryComparison({ ...input, ...patch }, LABOR_AUTO_CONTRIBUTION_RULES, rule); }

test('上海真实包：工资超过原15000仍按实际工资计税，不改法定上下限', () => {
  const result = frozen({ grossCents: 2000000, priorAverageWageCents: 2000000 });
  assert.ok(result.ok, JSON.stringify(result));
  if (result.ok) {
    assert.equal(result.lines.find((row) => row.id === 'comparison-monthly-paid')!.amountCents, 310000);
    assert.equal(result.lines.find((row) => row.id === 'comparison-annual-tax')!.amountCents, 1176000);
    assert.equal(result.monthlyMean.roundedCents, 1592000);
  }
  // Current pay does not replace the independently entered prior-year average.
  assert.equal(frozen({ grossCents: 4000000, priorAverageWageCents: 2000000 }).ok, true);
});

test('上海真实包：工资保留分精度，月均为展示约数而年净额不丢分', () => {
  const result = frozen({ grossCents: 1000001 });
  assert.ok(result.ok, JSON.stringify(result));
  if (result.ok) {
    assert.equal(result.lines.find((row) => row.id === 'comparison-annual-tax')!.amountCents, 162001);
    assert.deepEqual(result.monthlyMean, { numeratorCents: 9978011, denominator: 12, roundedCents: 831501, approximate: true });
  }
});

test('上海真实包：按项目接受整元工资域，不要求全部整百，也不猜公积金修约', () => {
  const five = auto({ priorAverageWageCents: 1002000 });
  assert.equal(five.personal.status, 'complete');
  assert.equal(five.personal.lines.find((row) => row.id === 'personal-total')!.amountCents, 155310);
  assert.equal(frozen({ priorAverageWageCents: 1002000 }).ok, true);
  const six = auto({ priorAverageWageCents: 1005000, housingRateBps: 600 });
  assert.equal(six.personal.status, 'complete');
  assert.equal(six.personal.lines.find((row) => row.id === 'personal-total')!.amountCents, 165825);
  const fractionalHousing = auto({ priorAverageWageCents: 1002000, housingRateBps: 600 });
  assert.equal(fractionalHousing.personal.status, 'partial');
  assert.ok(fractionalHousing.personal.missing.some((row) => row.itemId === 'housing' && row.reason.includes('不是整元')));
  assert.equal(frozen({ priorAverageWageCents: 1002000, housingRateBps: 600 }).ok, false);
  assert.equal(frozen({ priorAverageWageCents: 1000001 }).ok, false);
});

test('上海真实包：低于8000依法使用社保下限，不自动判为批准减缓或免缴', () => {
  const result = frozen({ grossCents: 300000, priorAverageWageCents: 300000 });
  assert.ok(result.ok, JSON.stringify(result));
  if (result.ok) {
    assert.equal(result.lines.find((row) => row.id === 'comparison-monthly-paid')!.amountCents, 94233);
    assert.equal(result.lines.find((row) => row.id === 'comparison-annual-tax')!.amountCents, 0);
    assert.equal(result.monthlyMean.roundedCents, 205767);
  }
  const low = auto({ grossCents: 0, priorAverageWageCents: 0 });
  assert.equal(low.personal.status, 'complete');
  assert.equal(low.personal.lines.find((row) => row.id === 'personal-total')!.amountCents, 92933);
  assert.equal(low.personal.lines.find((row) => row.id === 'personal-cash-shortfall')!.amountCents, 92933);
  assert.ok(!low.personal.lines.some((row) => row.id === 'before-tax'));
});

test('现金不足按一分边界拒税后比较，保留可追溯缴费现金缺口', () => {
  const short = auto({ grossCents: 154999 });
  const row = short.personal.lines.find((entry) => entry.id === 'personal-cash-shortfall')!;
  assert.equal(row.amountCents, 1);
  assert.ok(row.sourceIds.length && row.formula && row.scope.region);
  const rejected = frozen({ grossCents: 154999 });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.match(rejected.errors.join(''), /补足 1 分现金/);
  const equal = frozen({ grossCents: 155000 });
  assert.ok(equal.ok, JSON.stringify(equal));
  if (equal.ok) assert.equal(equal.monthlyMean.roundedCents, 0);
});

test('上海法定基数上下界仍原值：下限可分项精算，上限失业半分/住房非整元仍局部拒', () => {
  const lower = auto({ priorAverageWageCents: 754000 });
  assert.equal(lower.personal.status, 'complete');
  assert.equal(lower.personal.lines.find((row) => row.id === 'personal-pension')!.amountCents, 60368);
  assert.match(lower.personal.lines.find((row) => row.id === 'personal-pension')!.formula, /754600/);
  for (const priorAverageWageCents of [3773100, 4000000]) {
    const upper = auto({ grossCents: 4000000, priorAverageWageCents });
    assert.equal(upper.personal.status, 'partial');
    assert.equal(upper.personal.lines.find((row) => row.id === 'personal-pension')!.amountCents, 301848);
    assert.equal(upper.personal.lines.find((row) => row.id === 'personal-medical')!.amountCents, 75462);
    assert.ok(upper.personal.missing.some((row) => row.itemId === 'unemployment' && row.reason.includes('分以下')));
    assert.ok(upper.personal.missing.some((row) => row.itemId === 'housing' && row.reason.includes('不是整元')));
    assert.equal(frozen({ grossCents: 4000000, priorAverageWageCents }).ok, false);
  }
});

test('年度技术安全上限仍拒越界，不静默夹工资或改写输入', () => {
  const boundary = { ...input, grossCents: 8333333333 };
  const before = structuredClone(boundary);
  assert.equal(calculateFrozenSalaryComparison(boundary, LABOR_AUTO_CONTRIBUTION_RULES, rule).ok, true);
  assert.deepEqual(boundary, before);
  assert.equal(frozen({ grossCents: 8333333334 }).ok, false);
  assert.equal(frozen({ grossCents: Number.MAX_SAFE_INTEGER }).ok, false);
});
