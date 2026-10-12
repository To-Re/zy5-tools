import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAutoContributionScenario, type AutoContributionScenarioInput, type AutoContributionScenarioResult } from '../lib/labor-auto-scenario.ts';
import { LABOR_AUTO_CONTRIBUTION_RULES, LABOR_SOURCES } from '../lib/labor-rules.ts';

const ordinary: AutoContributionScenarioInput = { city: 'beijing', month: '2026-10', grossCents: 1000000, priorAverageWageCents: 1000000, housingRateBps: 500, assumptions: 'ordinary-employee-no-special-cases' };
const run = (patch: Partial<AutoContributionScenarioInput> = {}) => calculateAutoContributionScenario({ ...ordinary, ...patch }, LABOR_AUTO_CONTRIBUTION_RULES);
function amount(result: AutoContributionScenarioResult, id: string) { const row = result.lines.find((line) => line.id === id); assert.ok(row, `${id}: ${JSON.stringify(result.missing)}`); return row.amountCents; }
function absent(result: AutoContributionScenarioResult, ...ids: string[]) { for (const id of ids) assert.equal(result.lines.some((line) => line.id === id), false, id); }

test('独立自动情景：北京10000/5%手算1553，8447明确尚未扣税', () => {
  const result = run();
  assert.equal(result.personal.status, 'complete');
  for (const [id, cents] of [['personal-pension', 80000], ['personal-medical', 20300], ['personal-unemployment', 5000], ['personal-housing', 50000], ['personal-total', 155300], ['before-tax', 844700]] as const) assert.equal(amount(result, id), cents);
  assert.match(result.lines.find((line) => line.id === 'before-tax')!.formula, /不是到手|不含个税/);
  assert.equal(result.employer.status, 'partial');
  const medical = result.employer.lines.find((entry) => entry.id === 'employer-medical')!;
  assert.equal(medical.amountCents, 98000);
  for (const id of ['bj-medical-merger-2019', 'bj-medical-rate-2021']) assert.ok(medical.sourceIds.includes(id), '单位9.8%须保留2019构成及2021降费桥接依据');
  absent(result, 'company-cost', 'employer-total', 'net', 'withholding', 'annual-net');
});

test('独立自动情景：失业半分与单位医保厘位局部拒算，不能静默修约', () => {
  const even = run({ grossCents: 1000200, priorAverageWageCents: 1000200 });
  assert.equal(amount(even, 'personal-total'), 155321); assert.equal(amount(even, 'before-tax'), 844879);
  assert.equal(amount(even, 'personal-housing'), 50000);
  absent(even, 'employer-medical', 'company-cost');
  assert.ok(even.employer.missing.some((entry) => entry.itemId === 'medical' && /尾差/.test(entry.reason)));
  const odd = run({ grossCents: 1000100, priorAverageWageCents: 1000100 });
  assert.equal(amount(odd, 'personal-pension'), 80008); assert.equal(amount(odd, 'personal-medical'), 20302);
  absent(odd, 'personal-unemployment', 'employer-unemployment', 'personal-total', 'before-tax');
});

test('独立自动情景：社保与公积金分别限额，不将工资本身限额', () => {
  const low = run({ grossCents: 300000, priorAverageWageCents: 300000 });
  assert.equal(amount(low, 'personal-total'), 91635); assert.equal(amount(low, 'before-tax'), 208365);
  const high = run({ grossCents: 4000000, priorAverageWageCents: 4000000 });
  assert.equal(amount(high, 'personal-total'), 563654); assert.equal(amount(high, 'before-tax'), 3436346);
  assert.equal(amount(high, 'personal-housing'), 181700);
  assert.equal(amount(run({ grossCents: 4000000, priorAverageWageCents: 4000000, housingRateBps: 1200 }), 'personal-housing'), 436200);
});

test('独立自动情景：北京上年月均或当期工资触低薪均拒个人住房，显式基数不绕过', () => {
  for (const patch of [{ grossCents: 254000 }, { priorAverageWageCents: 200000 }, { priorAverageWageCents: 200000, housingBaseCents: 1000000 }]) {
    const result = run(patch); absent(result, 'personal-housing', 'personal-total', 'before-tax');
    assert.ok(result.personal.missing.some((entry) => entry.itemId === 'housing'));
    assert.ok(result.lines.some((line) => line.id === 'employer-housing'));
  }
});

test('独立自动情景：月份、身份、非法工资严格拒绝，无未知补零', () => {
  for (const patch of [{ month: '2026-09' }, { month: '2026-11' }, { grossCents: NaN }, { grossCents: -1 }, { grossCents: Number.MAX_SAFE_INTEGER }, { assumptions: undefined }]) {
    const result = run(patch as Partial<AutoContributionScenarioInput>); assert.equal(result.lines.length, 0);
  }
  for (const priorAverageWageCents of [NaN, -1, 1000001]) absent(run({ priorAverageWageCents }), 'personal-total', 'before-tax');
  absent(run({ housingRateBps: 550 }), 'personal-housing', 'personal-total');
});

test('独立自动情景：规则缺映射、来源或整月有效期，仅该项关闭且合计撤销', () => {
  for (const edit of [
    (item: typeof LABOR_AUTO_CONTRIBUTION_RULES[number]['items'][number]) => { item.base.mappingSourceIds = []; },
    (item: typeof LABOR_AUTO_CONTRIBUTION_RULES[number]['items'][number]) => { item.sourceIds = []; },
    (item: typeof LABOR_AUTO_CONTRIBUTION_RULES[number]['items'][number]) => { item.scope.validFrom = '2026-10-02'; },
  ]) {
    const rules = structuredClone(LABOR_AUTO_CONTRIBUTION_RULES); const item = rules.find((rule) => rule.city === 'beijing')!.items.find((item) => item.payer === 'personal' && item.id === 'pension')!; edit(item);
    const result = calculateAutoContributionScenario(ordinary, rules); absent(result, 'personal-pension', 'personal-total', 'before-tax');
  }
  const rules = structuredClone(LABOR_AUTO_CONTRIBUTION_RULES); rules.find((rule) => rule.city === 'beijing')!.personalZeroBurdenSourceIds = [];
  absent(calculateAutoContributionScenario(ordinary, rules), 'personal-total', 'before-tax');
});

test('独立自动情景：温州10000已核养老800及双方公积金500，无整包余额', () => {
  for (const rule of LABOR_AUTO_CONTRIBUTION_RULES.filter((rule) => rule.city === 'wenzhou')) {
    const result = run({ city: 'wenzhou', wenzhouArea: rule.area });
    assert.equal(amount(result, 'personal-pension'), 80000); assert.equal(amount(result, 'personal-housing'), 50000); assert.equal(amount(result, 'employer-housing'), 50000);
    absent(result, 'personal-total', 'before-tax', 'company-cost');
  }
  const common = run({ city: 'wenzhou' }); assert.equal(amount(common, 'personal-housing'), 50000); absent(common, 'personal-total', 'before-tax');
  const differing = run({ city: 'wenzhou', grossCents: 200000, priorAverageWageCents: 200000 }); absent(differing, 'personal-housing', 'before-tax');
});

test('独立自动情景：每个输出与映射可追溯注册来源，子域中不产税后值', () => {
  for (const rule of LABOR_AUTO_CONTRIBUTION_RULES) {
    for (const id of [...rule.sourceIds, ...rule.items.flatMap((item) => [...item.sourceIds, ...item.base.mappingSourceIds])]) {
      const source = LABOR_SOURCES[id]; assert.ok(source, id); assert.match(source.url, /^https:\/\//); assert.ok(source.authority); assert.equal(source.verifiedAt, '2026-10-12');
    }
    const result = run({ city: rule.city, wenzhouArea: rule.area });
    for (const line of result.lines) { assert.ok(line.formula); assert.ok(line.scope.population); assert.ok(line.sourceIds.length); for (const id of line.sourceIds) assert.ok(LABOR_SOURCES[id]); }
    absent(result, 'net', 'withholding', 'annual-net', 'company-cost');
  }
});

test('独立自动情景：目录外额外负担未闭合时，不因五项恰齐冒充单位完整', () => {
  const rules = structuredClone(LABOR_AUTO_CONTRIBUTION_RULES);
  const bj = rules.find((rule) => rule.city === 'beijing')!;
  // Real injury rule plus a supplied confirmed rate closes five rows; an extra gap must still block totals.
  bj.extraMissing = [{ payer: 'employer', reason: '独立测试：额外单位缴费依据尚未闭合' }];
  const result = calculateAutoContributionScenario({ ...ordinary, employerInjuryRateBps: 20, employerInjuryRateConfirmed: true }, rules);
  assert.equal(result.personal.status, 'complete'); assert.equal(result.employer.status, 'partial');
  absent(result, 'company-cost', 'employer-total'); assert.ok(result.employer.missing.some((entry) => /额外/.test(entry.reason)));
  for (const rule of rules.filter((rule) => rule.city === 'wenzhou')) rule.extraMissing = [{ payer: 'employer', reason: '独立测试县区额外缺口' }];
  const common = calculateAutoContributionScenario({ ...ordinary, city: 'wenzhou' }, rules);
  assert.ok(common.employer.missing.some((entry) => /额外缺口/.test(entry.reason))); absent(common, 'company-cost');
});

test('独立自动情景：北京核定工伤0.20%后单位3150、成本13150，不另叠互助或减征', () => {
  const result = run({ employerInjuryRateBps: 20, employerInjuryRateConfirmed: true });
  assert.equal(result.employer.status, 'complete');
  assert.equal(amount(result, 'employer-injury'), 2000);
  assert.equal(amount(result, 'employer-total'), 315000);
  assert.equal(amount(result, 'company-cost'), 1315000);
  assert.equal(amount(result, 'personal-total'), 155300);
  const changed = run({ employerInjuryRateBps: 40, employerInjuryRateConfirmed: true });
  assert.equal(amount(changed, 'company-cost'), 1317000);
  assert.equal(amount(changed, 'personal-total'), 155300);
});

test('独立自动情景：工伤未知、未确认、精度尾差只阻单位总成本', () => {
  for (const patch of [{ employerInjuryRateBps: 20 }, { employerInjuryRateConfirmed: true },
    { employerInjuryRateBps: 20, employerInjuryRateConfirmed: false },
    { employerInjuryRateBps: 0, employerInjuryRateConfirmed: true },
    { employerInjuryRateBps: 20.5, employerInjuryRateConfirmed: true },
    { employerInjuryRateBps: 10001, employerInjuryRateConfirmed: true }]) {
    const result = run(patch); absent(result, 'company-cost', 'employer-total', 'employer-injury');
    assert.equal(amount(result, 'personal-total'), 155300);
  }
  const tail = run({ grossCents: 1000200, priorAverageWageCents: 1000200, employerInjuryRateBps: 20, employerInjuryRateConfirmed: true });
  absent(tail, 'employer-injury', 'company-cost'); assert.equal(amount(tail, 'personal-total'), 155321);
});
