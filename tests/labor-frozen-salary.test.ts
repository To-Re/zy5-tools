import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFrozenSalaryComparison, calculateFrozenZeroTaxComparison, type FrozenZeroTaxProofRule, type FrozenSalaryComparisonInput, type FrozenSalaryComparisonRule, type FrozenSalaryComparisonResult } from '../lib/labor-frozen-salary.ts';
import { LABOR_AUTO_CONTRIBUTION_RULES, LABOR_TAX_RULE } from '../lib/labor-rules.ts';

const input: FrozenSalaryComparisonInput = { city: 'beijing', month: '2026-10', grossCents: 1000000, priorAverageWageCents: 1000000, housingRateBps: 500, assumptions: 'ordinary-employee-no-special-cases', frozenComparisonConfirmed: true };
/** Arithmetic-only evidence fixture. It does NOT admit Beijing medical tax deductibility
 * or establish a real housing tax cap. Production requires its own independent rule audit. */
function fixture(): FrozenSalaryComparisonRule {
  const scope = { region: '算术测试域', population: '非生产法规则；仅核对运算与闸门', validFrom: '2026-10-01', validTo: '2026-10-31', verifiedOn: '2026-10-12' };
  return { id: 'math-only', city: 'beijing', contributionRuleIds: [LABOR_AUTO_CONTRIBUTION_RULES.find((rule) => rule.city === 'beijing')!.id],
    tax: structuredClone(LABOR_TAX_RULE), sourceIds: [...LABOR_TAX_RULE.sourceIds, 'fixture-deduction'], scope,
    deductions: (['pension', 'medical', 'unemployment'] as const).map((itemId) => ({ itemId, mode: 'full-paid', sourceIds: ['fixture-deduction'], scope: { ...scope } })),
    ordinaryEmployerSocialExemption: { sourceIds: ['fixture-deduction'], scope: { ...scope } },
    housingTax: { maximumBaseCents: 3000000, maximumRateBps: 1200, sourceIds: ['fixture-deduction'], scope: { ...scope } },
  };
}
function amount(result: FrozenSalaryComparisonResult, id: string) {
  assert.ok(result.ok, JSON.stringify(result)); if (!result.ok) throw new Error('unreachable');
  const row = result.lines.find((item) => item.id === id); assert.ok(row); return row.amountCents;
}
test('手算D=L算式向量：12期税基41364、税1616.4、年净99747.6、月均8312.3', () => {
  const result = calculateFrozenSalaryComparison(input, LABOR_AUTO_CONTRIBUTION_RULES, fixture());
  for (const [id, cents] of Object.entries({ 'comparison-monthly-paid': 155300, 'comparison-monthly-deductible': 155300, 'comparison-annual-taxable': 4136400, 'comparison-annual-tax': 161640, 'comparison-annual-net': 9974760, 'comparison-monthly-mean-net': 831230 })) assert.equal(amount(result, id), cents);
  if (result.ok) { assert.equal(result.meaning, 'frozen-twelve-period-comparison'); assert.equal(result.monthlyMean.approximate, false); }
});
test('D与L独立：数学fixture排除固定3元，仅改变税基不减少实际现金扣款', () => {
  const rule = fixture(); const medical = rule.deductions.find((item) => item.itemId === 'medical')!;
  medical.mode = 'paid-minus-fixed'; medical.excludedFixedCents = 300;
  const result = calculateFrozenSalaryComparison(input, LABOR_AUTO_CONTRIBUTION_RULES, rule);
  assert.equal(amount(result, 'comparison-monthly-paid'), 155300);
  assert.equal(amount(result, 'comparison-monthly-deductible'), 155000);
  assert.equal(amount(result, 'comparison-annual-tax'), 162000);
  assert.equal(amount(result, 'comparison-annual-net'), 9974400);
  assert.equal(amount(result, 'comparison-monthly-mean-net'), 831200);
  medical.excludedFixedCents = 301;
  assert.equal(calculateFrozenSalaryComparison(input, LABOR_AUTO_CONTRIBUTION_RULES, rule).ok, false);
});
test('月均无法整除分保留年总额与精确分子/12，约数不得反乘覆盖年值', () => {
  const result = calculateFrozenSalaryComparison({ ...input, grossCents: 1000200, priorAverageWageCents: 1000200 }, LABOR_AUTO_CONTRIBUTION_RULES, fixture());
  assert.equal(amount(result, 'comparison-annual-tax'), 161855);
  assert.equal(amount(result, 'comparison-annual-net'), 9976693);
  assert.equal(amount(result, 'comparison-monthly-mean-net'), 831391);
  if (result.ok) {
    assert.deepEqual(result.monthlyMean, { numeratorCents: 9976693, denominator: 12, roundedCents: 831391, approximate: true });
    assert.match(result.lines.find((row) => row.id === 'comparison-monthly-mean-net')!.label, /约/);
    assert.notEqual(result.monthlyMean.roundedCents * 12, result.monthlyMean.numeratorCents);
  }
});
test('单位工伤未填不阻个人税比较，但单位住房缺项或超税限必须阻断', () => {
  assert.equal(calculateFrozenSalaryComparison(input, LABOR_AUTO_CONTRIBUTION_RULES, fixture()).ok, true);
  const rules = structuredClone(LABOR_AUTO_CONTRIBUTION_RULES);
  const bj = rules.find((rule) => rule.city === 'beijing')!;
  bj.items = bj.items.filter((item) => !(item.id === 'housing' && item.payer === 'employer'));
  assert.equal(calculateFrozenSalaryComparison(input, rules, fixture()).ok, false);
  const highEmployer = structuredClone(LABOR_AUTO_CONTRIBUTION_RULES);
  highEmployer.find((rule) => rule.city === 'beijing')!.items.find((item) => item.id === 'housing' && item.payer === 'employer')!.fixedCents = 100000;
  assert.equal(calculateFrozenSalaryComparison(input, highEmployer, fixture()).ok, false);
  assert.equal(calculateFrozenSalaryComparison({ ...input, housingBaseCents: 2000000, housingRateBps: 1200 }, LABOR_AUTO_CONTRIBUTION_RULES, fixture()).ok, false);
});
test('独立税cap按有理数比较：分以下边界不猜舍入，已知整分实缴可直接判定', () => {
  const rule = fixture(); rule.housingTax.maximumBaseCents = 300000;
  assert.equal(calculateFrozenSalaryComparison(input, LABOR_AUTO_CONTRIBUTION_RULES, rule).ok, false);
  const fractionalCap = fixture(); fractionalCap.housingTax.maximumBaseCents = 999999;
  const fractional = calculateFrozenSalaryComparison(input, LABOR_AUTO_CONTRIBUTION_RULES, fractionalCap);
  assert.equal(fractional.ok, true);
  if (fractional.ok) assert.match(fractional.lines.find((row) => row.id === 'comparison-deductible-housing')!.formula, /1199998800\/10000 分/);
  // Each party pays exactly 50000 cents. Cap 49999.92 is below that payment;
  // rounding the cap to cents would wrongly admit it. Cap 50000.04 admits it.
  const below = fixture(); below.housingTax.maximumBaseCents = 416666;
  assert.equal(calculateFrozenSalaryComparison(input, LABOR_AUTO_CONTRIBUTION_RULES, below).ok, false);
  const above = fixture(); above.housingTax.maximumBaseCents = 416667;
  assert.equal(calculateFrozenSalaryComparison(input, LABOR_AUTO_CONTRIBUTION_RULES, above).ok, true);
});
test('未确认、无准入规则、个人不完整、来源或期效缺失均拒，不把北京自动当税可扣', () => {
  assert.equal(calculateFrozenSalaryComparison(input, LABOR_AUTO_CONTRIBUTION_RULES).ok, false);
  assert.equal(calculateFrozenSalaryComparison({ ...input, frozenComparisonConfirmed: false }, LABOR_AUTO_CONTRIBUTION_RULES, fixture()).ok, false);
  assert.equal(calculateFrozenSalaryComparison({ ...input, priorAverageWageCents: 1000100 }, LABOR_AUTO_CONTRIBUTION_RULES, fixture()).ok, false);
  for (const change of [
    (rule: FrozenSalaryComparisonRule) => { rule.deductions.pop(); },
    (rule: FrozenSalaryComparisonRule) => { rule.deductions[0].sourceIds = []; },
    (rule: FrozenSalaryComparisonRule) => { rule.housingTax.scope.validFrom = '2026-10-02'; },
    (rule: FrozenSalaryComparisonRule) => { rule.scope.validTo = '2026-11-31'; },
    (rule: FrozenSalaryComparisonRule) => { rule.contributionRuleIds = []; },
    (rule: FrozenSalaryComparisonRule) => { rule.tax.brackets = []; },
    (rule: FrozenSalaryComparisonRule) => { rule.tax.sourceIds = []; },
  ]) { const rule = fixture(); change(rule); assert.equal(calculateFrozenSalaryComparison(input, LABOR_AUTO_CONTRIBUTION_RULES, rule).ok, false); }
});
test('只输出比较命名与可追溯金额，不产生当前月预扣、真实汇算差额或改写输入', () => {
  const rule = fixture(); const before = structuredClone(rule); const inputBefore = structuredClone(input);
  const result = calculateFrozenSalaryComparison(input, LABOR_AUTO_CONTRIBUTION_RULES, rule);
  assert.ok(result.ok);
  if (result.ok) {
    assert.ok(result.lines.every((row) => row.id.startsWith('comparison-') && row.sourceIds.length && row.formula));
    assert.ok(!result.lines.some((row) => ['net', 'withholding', 'annual-balance'].includes(row.id)));
    assert.ok(result.warnings.some((text) => text.includes('不是实际年度汇算')));
  }
  assert.deepEqual(rule, before); assert.deepEqual(input, inputBefore);
});


function zeroFixture(): FrozenZeroTaxProofRule {
  const parent = fixture();
  const proof = { sourceIds: ['fixture-deduction'], scope: { ...parent.scope } };
  return { id: 'zero-math-only', city: 'beijing', contributionRuleIds: parent.contributionRuleIds, tax: parent.tax,
    sourceIds: parent.sourceIds, scope: parent.scope, certainPensionDeduction: structuredClone(proof),
    employerHousingTaxableBound: structuredClone(proof), employerMedicalTaxableBound: structuredClone(proof),
    ordinaryEmployerSocialExemption: structuredClone(proof) };
}
const zeroInput: FrozenSalaryComparisonInput = { ...input, grossCents: 450000, priorAverageWageCents: 450000 };
test('保守零税：4500工资D991.35，单位住房225+医疗712.46全入上界，月均净3508.65', () => {
  const result = calculateFrozenZeroTaxComparison(zeroInput, LABOR_AUTO_CONTRIBUTION_RULES, zeroFixture());
  assert.equal(amount(result, 'comparison-monthly-paid'), 99135);
  assert.equal(amount(result, 'comparison-certain-pension-deduction'), 58160);
  assert.equal(amount(result, 'comparison-employer-income-upper-addition'), 93746);
  assert.equal(amount(result, 'comparison-taxable-upper-bound'), 0);
  assert.equal(amount(result, 'comparison-annual-tax'), 0);
  assert.equal(amount(result, 'comparison-annual-net'), 4210380);
  assert.equal(amount(result, 'comparison-monthly-mean-net'), 350865);
  if (result.ok) {
    assert.equal(result.meaning, 'frozen-zero-tax-bound-proof');
    assert.match(result.lines.find((row) => row.id === 'comparison-taxable-upper-bound')!.formula, /-172968/);
    assert.ok(!result.lines.some((row) => row.id === 'comparison-monthly-deductible'));
  }
});
test('保守零税5000拒；上界恰零可算，提高1分使12期税基上界为12分即拒', () => {
  assert.equal(calculateFrozenZeroTaxComparison({ ...zeroInput, grossCents: 500000, priorAverageWageCents: 500000 }, LABOR_AUTO_CONTRIBUTION_RULES, zeroFixture()).ok, false);
  assert.equal(calculateFrozenZeroTaxComparison({ ...zeroInput, grossCents: 464414 }, LABOR_AUTO_CONTRIBUTION_RULES, zeroFixture()).ok, true);
  const above = calculateFrozenZeroTaxComparison({ ...zeroInput, grossCents: 464415 }, LABOR_AUTO_CONTRIBUTION_RULES, zeroFixture());
  assert.equal(above.ok, false); if (!above.ok) assert.match(above.errors.join(''), /上界/);
});
test('保守证明缺单位医疗、住房或额外未核支付就拒，不把潜在应税收入补零', () => {
  for (const id of ['medical', 'housing']) {
    const rules = structuredClone(LABOR_AUTO_CONTRIBUTION_RULES);
    const bj = rules.find((rule) => rule.city === 'beijing')!;
    bj.items = bj.items.filter((item) => !(item.payer === 'employer' && item.id === id));
    assert.equal(calculateFrozenZeroTaxComparison(zeroInput, rules, zeroFixture()).ok, false);
  }
  const extra = structuredClone(LABOR_AUTO_CONTRIBUTION_RULES); extra.find((rule) => rule.city === 'beijing')!.extraMissing = [{ payer: 'employer', reason: '未知额外缴费' }];
  assert.equal(calculateFrozenZeroTaxComparison(zeroInput, extra, zeroFixture()).ok, false);
  assert.equal(calculateFrozenSalaryComparison(input, extra, fixture()).ok, false);
  const proof = zeroFixture(); proof.employerMedicalTaxableBound.sourceIds = [];
  assert.equal(calculateFrozenZeroTaxComparison(zeroInput, LABOR_AUTO_CONTRIBUTION_RULES, proof).ok, false);
});
test('保守零税不依赖假住房税限或D=L；普通免税桥、确认与准入仍必须有', () => {
  const proof = zeroFixture();
  assert.equal(calculateFrozenZeroTaxComparison(zeroInput, LABOR_AUTO_CONTRIBUTION_RULES, proof).ok, true);
  assert.equal(calculateFrozenZeroTaxComparison(zeroInput, LABOR_AUTO_CONTRIBUTION_RULES).ok, false);
  assert.equal(calculateFrozenZeroTaxComparison({ ...zeroInput, frozenComparisonConfirmed: false }, LABOR_AUTO_CONTRIBUTION_RULES, proof).ok, false);
  proof.ordinaryEmployerSocialExemption.sourceIds = [];
  assert.equal(calculateFrozenZeroTaxComparison(zeroInput, LABOR_AUTO_CONTRIBUTION_RULES, proof).ok, false);
});

test('两税模式拒纯基数覆盖，不能通过抬高养老基数夸大合法扣除或零税范围', () => {
  for (const patch of [{ socialBaseCents: 3634800 }, { housingBaseCents: 1000000 }, { socialBaseCents: 727000 }]) {
    assert.equal(calculateFrozenSalaryComparison({ ...input, ...patch }, LABOR_AUTO_CONTRIBUTION_RULES, fixture()).ok, false);
    assert.equal(calculateFrozenZeroTaxComparison({ ...zeroInput, ...patch }, LABOR_AUTO_CONTRIBUTION_RULES, zeroFixture()).ok, false);
  }
});
test('单位养老失业必须有有效规则及金额，不能因个人完整就默认单位税收待遇', () => {
  for (const id of ['pension', 'unemployment']) {
    const rules = structuredClone(LABOR_AUTO_CONTRIBUTION_RULES);
    const bj = rules.find((rule) => rule.city === 'beijing')!;
    bj.items = bj.items.filter((item) => !(item.payer === 'employer' && item.id === id));
    assert.equal(calculateFrozenSalaryComparison(input, rules, fixture()).ok, false);
    assert.equal(calculateFrozenZeroTaxComparison(zeroInput, rules, zeroFixture()).ok, false);
  }
});

test('full专门法定单位失业豁免无需未知金额，来源严格；zero仍不得绕过', () => {
  const rules = structuredClone(LABOR_AUTO_CONTRIBUTION_RULES);
  const bj = rules.find((item) => item.city === 'beijing')!;
  bj.items = bj.items.filter((item) => !(item.payer === 'employer' && item.id === 'unemployment'));
  const rule = fixture();
  rule.employerStatutoryExemptionWithoutAmount = { unemployment: { sourceIds: ['fixture-deduction'], scope: { ...rule.scope } } };
  const result = calculateFrozenSalaryComparison(input, rules, rule);
  assert.equal(amount(result, 'comparison-annual-net'), 9974760);
  if (result.ok) {
    assert.ok(result.warnings.some((text) => text.includes('金额仍未知')));
    assert.ok(!result.lines.some((row) => row.id === 'employer-unemployment' || row.id === 'company-cost'));
  }
  assert.equal(calculateFrozenZeroTaxComparison(zeroInput, rules, zeroFixture()).ok, false);
  for (const evidence of [
    { sourceIds: [], scope: rule.scope },
    { sourceIds: ['unregistered'], scope: rule.scope },
    { sourceIds: ['fixture-deduction'], scope: { ...rule.scope, validFrom: '2026-10-15' } },
  ]) { const changed = structuredClone(rule); changed.employerStatutoryExemptionWithoutAmount = { unemployment: evidence }; assert.equal(calculateFrozenSalaryComparison(input, rules, changed).ok, false); }
  bj.items = bj.items.filter((item) => !(item.payer === 'employer' && item.id === 'pension'));
  assert.equal(calculateFrozenSalaryComparison(input, rules, rule).ok, false);
});

test('税比较产品域独立于法定基数范围，域外拒算不自动夹到8000或15000', () => {
  const rule = fixture();
  rule.inputDomain = { gross: { minimumCents: 800000, maximumCents: 1500000, stepCents: 10000 }, priorAverageWage: { minimumCents: 800000, maximumCents: 1500000, stepCents: 10000 }, housingRateBps: [500, 600, 700], note: '测试产品子集8000至15000整百，住房5/6/7%' };
  assert.equal(calculateFrozenSalaryComparison(input, LABOR_AUTO_CONTRIBUTION_RULES, rule).ok, true);
  for (const patch of [{ grossCents: 799999 }, { grossCents: 1500001 }, { grossCents: 1000200 }, { priorAverageWageCents: 799900 }, { priorAverageWageCents: 1500100 }, { priorAverageWageCents: 1000200 }, { housingRateBps: 800 }]) {
    const result = calculateFrozenSalaryComparison({ ...input, ...patch }, LABOR_AUTO_CONTRIBUTION_RULES, rule);
    assert.equal(result.ok, false);
  }
});
