import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFrozenSalaryComparison, calculateFrozenZeroTaxComparison, type FrozenSalaryComparisonInput, type FrozenSalaryComparisonRule, type FrozenZeroTaxProofRule } from '../lib/labor-frozen-salary.ts';
import { LABOR_AUTO_CONTRIBUTION_RULES, LABOR_TAX_RULE, LABOR_FROZEN_ZERO_TAX_RULES, LABOR_FROZEN_SALARY_RULES, LABOR_SOURCES, type LaborSource } from '../lib/labor-rules.ts';

// Numerical contract fixtures ONLY. These source IDs do not admit any production tax rule.
const fixtureScope = { region: '北京（仅数值测试）', population: '独立数值测试；不作为现实税扣准入', validFrom: '2026-10-01', validTo: '2026-10-31', verifiedOn: '2026-10-12' };
function fixture(): FrozenSalaryComparisonRule {
  return { id: 'independent-numerical-fixture', city: 'beijing', contributionRuleIds: ['bj-ordinary-auto-202610'], scope: fixtureScope,
    sourceIds: [...LABOR_TAX_RULE.sourceIds, 'test-only-deduction'], tax: structuredClone(LABOR_TAX_RULE),
    ordinaryEmployerSocialExemption: { sourceIds: ['test-only-deduction'], scope: fixtureScope },
    deductions: (['pension', 'medical', 'unemployment'] as const).map((itemId) => ({ itemId, mode: 'full-paid', sourceIds: ['test-only-deduction'], scope: fixtureScope })),
    housingTax: { maximumBaseCents: 1500000, maximumRateBps: 1200, sourceIds: ['test-only-deduction'], scope: fixtureScope } };
}
const input: FrozenSalaryComparisonInput = { city: 'beijing', month: '2026-10', grossCents: 1000000, priorAverageWageCents: 1000000, housingRateBps: 500, assumptions: 'ordinary-employee-no-special-cases', frozenComparisonConfirmed: true };
const run = (patch: Partial<FrozenSalaryComparisonInput> = {}, rule = fixture()) => calculateFrozenSalaryComparison({ ...input, ...patch }, LABOR_AUTO_CONTRIBUTION_RULES, rule);

test('独立冻结税收数值：无生产规则或无情景确认必须拒', () => {
  assert.equal(calculateFrozenSalaryComparison(input, LABOR_AUTO_CONTRIBUTION_RULES).ok, false);
  assert.equal(run({ frozenComparisonConfirmed: false }).ok, false);
  assert.equal(run({ month: '2026-09' }).ok, false);
});

test('独立冻结税收数值：现金D和税扣L分离，差3元只作用于税基', () => {
  const full = run(); assert.ok(full.ok);
  assert.equal(full.lines.find((r) => r.id === 'comparison-annual-tax')!.amountCents, 161640);
  assert.equal(full.lines.find((r) => r.id === 'comparison-annual-net')!.amountCents, 9974760);
  assert.equal(full.monthlyMean.roundedCents, 831230);
  const rule = fixture(); Object.assign(rule.deductions[1], { mode: 'paid-minus-fixed', excludedFixedCents: 300 });
  const reduced = run({}, rule); assert.ok(reduced.ok);
  assert.equal(reduced.lines.find((r) => r.id === 'comparison-monthly-paid')!.amountCents, 155300);
  assert.equal(reduced.lines.find((r) => r.id === 'comparison-monthly-deductible')!.amountCents, 155000);
  assert.equal(reduced.lines.find((r) => r.id === 'comparison-annual-tax')!.amountCents, 162000);
  assert.equal(reduced.monthlyMean.roundedCents, 831200);
  assert.equal(reduced.lines.some((r) => ['net', 'withholding', 'annual-balance'].includes(r.id)), false);
});

test('独立冻结税收数值：年税取分后月均保留有理数，不伪造逐月预扣', () => {
  const result = run({ grossCents: 1000200, priorAverageWageCents: 1000200 }); assert.ok(result.ok);
  assert.equal(result.lines.find((r) => r.id === 'comparison-annual-tax')!.amountCents, 161855);
  assert.deepEqual(result.monthlyMean, { numeratorCents: 9976693, denominator: 12, roundedCents: 831391, approximate: true });
});

test('独立冻结税收数值：住房独立税限、本人均薪、双方缴存及分下尾差均设门禁', () => {
  assert.equal(run({ priorAverageWageCents: 500000, housingBaseCents: 2000000 }).ok, false);
  const lowCap = fixture(); lowCap.housingTax.maximumBaseCents = 100000;
  assert.equal(run({}, lowCap).ok, false);
  const tail = fixture(); tail.housingTax.maximumBaseCents = 100001;
  assert.equal(run({}, tail).ok, false);
  const noSource = fixture(); noSource.deductions[1].sourceIds = [];
  assert.equal(run({}, noSource).ok, false);
  assert.equal(run({ grossCents: 1000100, priorAverageWageCents: 1000100 }).ok, false);
});

function zeroFixture(): FrozenZeroTaxProofRule {
  const evidence = { sourceIds: ['test-only-deduction'], scope: fixtureScope };
  return { id: 'independent-zero-fixture', city: 'beijing', contributionRuleIds: ['bj-ordinary-auto-202610'], scope: fixtureScope,
    sourceIds: [...LABOR_TAX_RULE.sourceIds, 'test-only-deduction'], tax: structuredClone(LABOR_TAX_RULE),
    certainPensionDeduction: evidence, employerHousingTaxableBound: evidence, employerMedicalTaxableBound: evidence, ordinaryEmployerSocialExemption: evidence };
}
const zeroInput = { ...input, grossCents: 450000, priorAverageWageCents: 450000 };

test('独立零税上界：4500纳入全单位医疗住房仍为0，现金不加非现金缴费', () => {
  const result = calculateFrozenZeroTaxComparison(zeroInput, LABOR_AUTO_CONTRIBUTION_RULES, zeroFixture()); assert.ok(result.ok);
  assert.equal(result.lines.find((r) => r.id === 'comparison-monthly-paid')!.amountCents, 99135);
  assert.equal(result.lines.find((r) => r.id === 'comparison-employer-income-upper-addition')!.amountCents, 93746);
  assert.equal(result.lines.find((r) => r.id === 'comparison-annual-tax')!.amountCents, 0);
  assert.equal(result.lines.find((r) => r.id === 'comparison-annual-net')!.amountCents, 4210380);
  assert.equal(result.monthlyMean.roundedCents, 350865);
  assert.match(result.lines.find((r) => r.id === 'comparison-taxable-upper-bound')!.formula, /-172968/);
  assert.equal(calculateFrozenZeroTaxComparison({ ...zeroInput, grossCents: 500000, priorAverageWageCents: 500000 }, LABOR_AUTO_CONTRIBUTION_RULES, zeroFixture()).ok, false);
});

test('独立零税上界：缺单位医疗/住房或目录外额外项目不可省略潜在收入', () => {
  for (const itemId of ['medical', 'housing']) {
    const rules = structuredClone(LABOR_AUTO_CONTRIBUTION_RULES); const bj = rules.find((r) => r.city === 'beijing')!;
    bj.items = bj.items.filter((r) => !(r.payer === 'employer' && r.id === itemId));
    assert.equal(calculateFrozenZeroTaxComparison(zeroInput, rules, zeroFixture()).ok, false);
  }
  const rules = structuredClone(LABOR_AUTO_CONTRIBUTION_RULES); rules.find((r) => r.city === 'beijing')!.extraMissing = [{ payer: 'employer', reason: '未知额外收入' }];
  assert.equal(calculateFrozenZeroTaxComparison(zeroInput, rules, zeroFixture()).ok, false);
  assert.equal(calculateFrozenSalaryComparison(input, rules, fixture()).ok, false);
});

test('独立税收回归：纯基数不能伪造合法养老扣除，单位养老失业缺项拒', () => {
  for (const patch of [{ socialBaseCents: 3634800 }, { housingBaseCents: 450000 }]) {
    assert.equal(calculateFrozenZeroTaxComparison({ ...zeroInput, ...patch }, LABOR_AUTO_CONTRIBUTION_RULES, zeroFixture()).ok, false);
    assert.equal(run(patch).ok, false);
  }
  for (const itemId of ['pension', 'unemployment']) {
    const rules = structuredClone(LABOR_AUTO_CONTRIBUTION_RULES); const bj = rules.find((r) => r.city === 'beijing')!;
    bj.items = bj.items.filter((r) => !(r.payer === 'employer' && r.id === itemId));
    assert.equal(calculateFrozenZeroTaxComparison(zeroInput, rules, zeroFixture()).ok, false);
    assert.equal(calculateFrozenSalaryComparison(input, rules, fixture()).ok, false);
  }
});

test('独立零税上界：4637上界负1.68可证零，4638上界正10.32即拒', () => {
  const low = calculateFrozenZeroTaxComparison({ ...zeroInput, grossCents: 463700, priorAverageWageCents: 463700 }, LABOR_AUTO_CONTRIBUTION_RULES, zeroFixture());
  assert.ok(low.ok); assert.equal(low.monthlyMean.roundedCents, 363865);
  assert.match(low.lines.find((r) => r.id === 'comparison-taxable-upper-bound')!.formula, /-168/);
  assert.equal(calculateFrozenZeroTaxComparison({ ...zeroInput, grossCents: 463800, priorAverageWageCents: 463800 }, LABOR_AUTO_CONTRIBUTION_RULES, zeroFixture()).ok, false);
});

test('独立完整税收桥接：单位失业无金额须有专用有效豁免证据，不能输出零缴费', () => {
  const contributions = structuredClone(LABOR_AUTO_CONTRIBUTION_RULES); const bj = contributions.find((r) => r.city === 'beijing')!;
  bj.items = bj.items.filter((r) => !(r.payer === 'employer' && r.id === 'unemployment'));
  const rule = fixture();
  assert.equal(calculateFrozenSalaryComparison(input, contributions, rule).ok, false);
  rule.sourceIds.push('independent-employer-unemployment-exemption');
  rule.employerStatutoryExemptionWithoutAmount = { unemployment: { sourceIds: ['independent-employer-unemployment-exemption'], scope: { ...fixtureScope } } };
  const result = calculateFrozenSalaryComparison(input, contributions, rule); assert.ok(result.ok);
  assert.equal(result.monthlyMean.roundedCents, 831230);
  assert.ok(result.lines.every((r) => !['employer-unemployment', 'company-cost', 'employer-total'].includes(r.id)));
  assert.ok(result.lines.find((r) => r.id === 'comparison-annual-net')!.sourceIds.includes('independent-employer-unemployment-exemption'));
  for (const mutation of [
    (r: FrozenSalaryComparisonRule) => { r.employerStatutoryExemptionWithoutAmount!.unemployment.sourceIds = []; },
    (r: FrozenSalaryComparisonRule) => { r.employerStatutoryExemptionWithoutAmount!.unemployment.scope.validTo = '2026-09-30'; },
    (r: FrozenSalaryComparisonRule) => { r.sourceIds = r.sourceIds.filter((id) => id !== 'independent-employer-unemployment-exemption'); },
  ]) { const broken = structuredClone(rule); mutation(broken); assert.equal(calculateFrozenSalaryComparison(input, contributions, broken).ok, false); }
  bj.items = bj.items.filter((r) => !(r.payer === 'employer' && r.id === 'pension'));
  assert.equal(calculateFrozenSalaryComparison(input, contributions, rule).ok, false);
  assert.equal(calculateFrozenZeroTaxComparison(zeroInput, contributions, zeroFixture()).ok, false);
});

test('独立生产北京零税：4500年净42103.80，逐字段及逐结果均有注册官方依据', () => {
  const rule = LABOR_FROZEN_ZERO_TAX_RULES.find((r) => r.city === 'beijing'); assert.ok(rule);
  for (const evidence of [rule, rule.tax, rule.certainPensionDeduction, rule.employerHousingTaxableBound, rule.employerMedicalTaxableBound, rule.ordinaryEmployerSocialExemption]) {
    assert.ok(evidence.scope.population); assert.equal(evidence.scope.verifiedOn, '2026-10-12');
    assert.ok(evidence.sourceIds.length);
    for (const id of evidence.sourceIds) {
      assert.ok(rule.sourceIds.includes(id)); const source: LaborSource = LABOR_SOURCES[id]; assert.ok(source, id);
      assert.match(source.url, /^https:\/\//); assert.ok(source.authority); assert.equal(source.verifiedAt, '2026-10-12');
    }
  }
  const result = calculateFrozenZeroTaxComparison(zeroInput, LABOR_AUTO_CONTRIBUTION_RULES, rule); assert.ok(result.ok);
  assert.equal(result.meaning, 'frozen-zero-tax-bound-proof'); assert.equal(result.monthlyMean.roundedCents, 350865);
  assert.equal(result.lines.find((r) => r.id === 'comparison-annual-net')!.amountCents, 4210380);
  for (const row of result.lines) {
    assert.ok(row.formula); assert.equal(row.scope.region, '北京'); assert.ok(row.scope.population.includes('居民'));
    assert.ok(row.sourceIds.includes('iit-contribution-deduction'));
    assert.ok(row.sourceIds.includes('bj-medical-merger-2019')); assert.ok(row.sourceIds.includes('bj-medical-rate-2021'));
    for (const id of row.sourceIds) assert.ok(LABOR_SOURCES[id], id);
  }
  for (const patch of [{ grossCents: 500000, priorAverageWageCents: 500000 }, { month: '2026-11' }, { frozenComparisonConfirmed: false }, { socialBaseCents: 3634800 }, { housingBaseCents: 450000 }]) {
    assert.equal(calculateFrozenZeroTaxComparison({ ...zeroInput, ...patch }, LABOR_AUTO_CONTRIBUTION_RULES, rule).ok, false);
  }
  const missing = structuredClone(rule); missing.employerMedicalTaxableBound.sourceIds = [];
  assert.equal(calculateFrozenZeroTaxComparison(zeroInput, LABOR_AUTO_CONTRIBUTION_RULES, missing).ok, false);
});

const shInput: FrozenSalaryComparisonInput = { ...input, city: 'shanghai' };
function shRun(patch: Partial<FrozenSalaryComparisonInput> = {}) {
  return calculateFrozenSalaryComparison({ ...shInput, ...patch }, LABOR_AUTO_CONTRIBUTION_RULES, LABOR_FROZEN_SALARY_RULES.find((r) => r.city === 'shanghai'));
}

test('独立生产上海：三住房档、税率跨档与上下界手算黄金', () => {
  // Yuan expectations independently evaluated from D=G*(8%+2%+0.5%+housing), annual taxable=12*(G-D)-60000.
  for (const [gross, rate, paid, annualTax, monthlyNet] of [
    [10000, 500, 1550, 1620, 8315], [10000, 600, 1650, 1500, 8225], [10000, 700, 1750, 1380, 8135],
    [8000, 500, 1240, 633.60, 6707.20], [15000, 500, 2325, 6690, 12117.50],
    [9400, 500, 1457, 1059.48, 7854.71], [9500, 500, 1472.50, 1113, 7934.75],
    [12000, 700, 2100, 3360, 9620], [14300, 600, 2359.50, 5808.60, 11456.45],
  ]) {
    const result = shRun({ grossCents: gross * 100, priorAverageWageCents: gross * 100, housingRateBps: rate }); assert.ok(result.ok, `${gross}/${rate}`);
    const value = (id: string) => result.lines.find((r) => r.id === id)!.amountCents;
    assert.equal(value('comparison-monthly-paid'), Math.round(paid * 100));
    assert.equal(value('comparison-monthly-deductible'), Math.round(paid * 100));
    assert.equal(value('comparison-annual-tax'), Math.round(annualTax * 100));
    assert.equal(value('comparison-annual-net'), Math.round(monthlyNet * 1200));
    assert.equal(result.monthlyMean.roundedCents, Math.round(monthlyNet * 100));
    assert.equal(result.meaning, 'frozen-twelve-period-comparison');
    assert.ok(result.lines.every((r) => !['withholding', 'net', 'annual-balance', 'employer-unemployment', 'employer-total', 'company-cost'].includes(r.id)));
  }
});

test('独立生产上海：工资已扩至分精度，上年月均按项目精度，不能显式基数绕过', () => {
  for (const value of [NaN, -1, Number.MAX_SAFE_INTEGER]) {
    assert.equal(shRun({ grossCents: value }).ok, false, `gross ${value}`);
    assert.equal(shRun({ priorAverageWageCents: value }).ok, false, `prior ${value}`);
  }
  for (const value of [799900, 790000, 1500100, 1510000, 1000100]) assert.ok(shRun({ grossCents: value }).ok);
  for (const value of [799900, 1500100, 1000100]) assert.equal(shRun({ priorAverageWageCents: value }).ok, false); // Actual item tails, not old8000/15000 domain.
  for (const value of [790000, 1510000]) assert.ok(shRun({ priorAverageWageCents: value }).ok);
  for (const patch of [{ housingRateBps: 400 }, { housingRateBps: 800 }, { housingRateBps: 550 }, { socialBaseCents: 1000000 }, { housingBaseCents: 1000000 }, { month: '2026-11' }, { frozenComparisonConfirmed: false }]) assert.equal(shRun(patch).ok, false);
  const distinct = shRun({ grossCents: 1000000, priorAverageWageCents: 800000 }); assert.ok(distinct.ok);
  assert.equal(distinct.lines.find((r) => r.id === 'comparison-monthly-paid')!.amountCents, 124000);
  assert.equal(distinct.monthlyMean.roundedCents, 859400);
});

test('独立生产上海：官方税扣/医保公共基金/失业连续性/住房税限逐字段与结果完备', () => {
  const rule = LABOR_FROZEN_SALARY_RULES.find((r) => r.city === 'shanghai'); assert.ok(rule);
  assert.equal(rule.housingTax.maximumBaseCents, 3773100); assert.equal(rule.housingTax.maximumRateBps, 1200);
  assert.ok(rule.ordinaryEmployerSocialExemption.sourceIds.includes('sh-medical-public-fund-definition'));
  for (const evidence of [rule, rule.tax, ...rule.deductions, rule.housingTax, rule.ordinaryEmployerSocialExemption, rule.employerStatutoryExemptionWithoutAmount!.unemployment]) {
    assert.ok(evidence.sourceIds.length); assert.ok(evidence.scope.population); assert.equal(evidence.scope.verifiedOn, '2026-10-12');
    for (const id of evidence.sourceIds) {
      assert.ok(rule.sourceIds.includes(id)); const source: LaborSource = LABOR_SOURCES[id]; assert.ok(source, id);
      assert.match(source.url, /^https:\/\//); assert.ok(source.authority); assert.equal(source.verifiedAt, '2026-10-12');
    }
  }
  const result = shRun(); assert.ok(result.ok);
  for (const row of result.lines) { assert.ok(row.formula); assert.ok(row.scope.population.includes('居民')); assert.equal(row.scope.region, '上海'); assert.ok(row.sourceIds.length); for (const id of row.sourceIds) assert.ok(LABOR_SOURCES[id]); }
  const net = result.lines.find((r) => r.id === 'comparison-annual-net')!;
  for (const id of ['iit-contribution-deduction', 'sh-medical-public-fund-definition', 'sh-housing-base-tax-cap-2026', 'sh-long-term-care-2026', 'sh-unemployment-personal-base-2013', 'sh-unemployment-personal-continuity-2016', 'sh-pension-pooling-explanation']) assert.ok(net.sourceIds.includes(id), id);
  const noBridge = structuredClone(rule); delete noBridge.employerStatutoryExemptionWithoutAmount;
  assert.equal(calculateFrozenSalaryComparison(shInput, LABOR_AUTO_CONTRIBUTION_RULES, noBridge).ok, false);
  const noDeduction = structuredClone(rule); noDeduction.deductions[1].sourceIds = [];
  assert.equal(calculateFrozenSalaryComparison(shInput, LABOR_AUTO_CONTRIBUTION_RULES, noDeduction).ok, false);
});
