import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAutoContributionScenario, type AutoContributionRule, type AutoContributionScenarioInput, type AutoContributionScenarioResult } from '../lib/labor-auto-scenario.ts';
import { LABOR_AUTO_CONTRIBUTION_RULES, LABOR_SOURCES } from '../lib/labor-rules.ts';

const input: AutoContributionScenarioInput = { city: 'beijing', month: '2026-10', grossCents: 1_000_000, priorAverageWageCents: 1_000_000, housingRateBps: 500, assumptions: 'ordinary-employee-no-special-cases' };
function bjRule(): AutoContributionRule { return structuredClone(LABOR_AUTO_CONTRIBUTION_RULES.find((rule) => rule.city === 'beijing')!); }
function amount(result: AutoContributionScenarioResult, id: string): number {
  const line = result.lines.find((row) => row.id === id);
  assert.ok(line, `${id} missing: ${JSON.stringify(result.missing)}`);
  return line.amountCents;
}

test('北京城市+10000月薪方案自动算1553个人缴费/8447个税前，单位工伤未知不造公司总额', () => {
  const result = calculateAutoContributionScenario(input, LABOR_AUTO_CONTRIBUTION_RULES);
  assert.equal(result.personal.status, 'complete'); assert.equal(result.employer.status, 'partial');
  for (const [id, cents] of Object.entries({ 'personal-pension': 80000, 'personal-medical': 20300, 'personal-unemployment': 5000, 'personal-housing': 50000, 'personal-total': 155300, 'before-tax': 844700, 'employer-pension': 160000, 'employer-medical': 98000, 'employer-unemployment': 5000, 'employer-housing': 50000, 'employer-known-subtotal': 313000 })) assert.equal(amount(result, id), cents);
  assert.ok(result.employer.missing.some((item) => item.itemId === 'injury'));
  assert.ok(!result.lines.some((row) => ['company-cost', 'net', 'withholding'].includes(row.id)));
});
test('10001奇数元失业半分局部拒算；10002个人完整但单位医保厘位尾差仍拒算', () => {
  const odd = calculateAutoContributionScenario({ ...input, grossCents: 1000100, priorAverageWageCents: 1000100 }, LABOR_AUTO_CONTRIBUTION_RULES);
  assert.equal(odd.personal.status, 'partial'); assert.ok(odd.personal.missing.some((item) => item.itemId === 'unemployment'));
  assert.ok(!odd.lines.some((row) => ['personal-total', 'before-tax'].includes(row.id)));
  assert.equal(amount(odd, 'personal-pension'), 80008);
  const even = calculateAutoContributionScenario({ ...input, grossCents: 1000200, priorAverageWageCents: 1000200 }, LABOR_AUTO_CONTRIBUTION_RULES);
  assert.equal(even.personal.status, 'complete'); assert.equal(amount(even, 'personal-total'), 155321);
  assert.equal(amount(even, 'before-tax'), 844879);
  assert.ok(even.employer.missing.some((item) => item.itemId === 'medical'));
  assert.ok(!even.employer.lines.some((row) => row.id === 'employer-medical'));
});
test('上年平均与本月工资独立，分别按社保/住房上下限映射；不使用统一基数下限', () => {
  const low = calculateAutoContributionScenario({ ...input, priorAverageWageCents: 600000 }, LABOR_AUTO_CONTRIBUTION_RULES);
  assert.equal(amount(low, 'personal-pension'), 58160); assert.equal(amount(low, 'personal-medical'), 14840);
  assert.equal(amount(low, 'personal-unemployment'), 3635); assert.equal(amount(low, 'personal-housing'), 30000);
  assert.equal(amount(low, 'before-tax'), 893365);
  const capped = calculateAutoContributionScenario({ ...input, grossCents: 4000000, priorAverageWageCents: 4000000 }, LABOR_AUTO_CONTRIBUTION_RULES);
  assert.equal(amount(capped, 'personal-housing'), 181700); assert.equal(amount(capped, 'personal-total'), 563654);
  assert.equal(amount(capped, 'before-tax'), 3436346);
});
test('公积金半元逐方取整；低薪个人减缴未知仅阻个人住房，单位住房继续已知', () => {
  const half = calculateAutoContributionScenario({ ...input, grossCents: 1001000, priorAverageWageCents: 1001000 }, LABOR_AUTO_CONTRIBUTION_RULES);
  assert.equal(amount(half, 'personal-housing'), 50100); assert.equal(amount(half, 'employer-housing'), 50100);
  const low = calculateAutoContributionScenario({ ...input, grossCents: 254000, priorAverageWageCents: 254000 }, LABOR_AUTO_CONTRIBUTION_RULES);
  assert.equal(low.personal.status, 'partial'); assert.ok(low.personal.missing.some((item) => item.itemId === 'housing'));
  assert.equal(amount(low, 'employer-housing'), 12700);
  assert.ok(!low.lines.some((row) => row.id === 'before-tax'));
});
test('纯显式基数方案不伪造核定、不读取单位合计；显式越界不自动夹取', () => {
  const explicit = { ...input, socialBaseCents: 1000000, housingBaseCents: 1000000 };
  Object.defineProperty(explicit, 'employerContributionCents', { get() { throw new Error('must not read precomputed contribution'); } });
  assert.equal(amount(calculateAutoContributionScenario(explicit, LABOR_AUTO_CONTRIBUTION_RULES), 'personal-total'), 155300);
  const result = calculateAutoContributionScenario({ ...input, socialBaseCents: 999999999 }, LABOR_AUTO_CONTRIBUTION_RULES);
  assert.equal(result.personal.status, 'partial'); assert.equal(amount(result, 'personal-housing'), 50000);
  assert.ok(!result.lines.some((row) => row.id === 'personal-pension'));
  const rules = [bjRule()];
  rules[0].items = rules[0].items.map((item) => ({ ...item, base: { ...item.base, mapping: 'explicit-only' } }));
  assert.equal(calculateAutoContributionScenario(input, rules).personal.status, 'unavailable');
  assert.equal(calculateAutoContributionScenario(explicit, rules).personal.status, 'complete');
});
test('缺一分项来源/映射/个人零负担或规则日期有误不生成伪完整个人金额', () => {
  const sourceRule = bjRule(); sourceRule.items.find((item) => item.payer === 'personal' && item.id === 'medical')!.sourceIds = [];
  const mappingRule = bjRule(); mappingRule.items.find((item) => item.payer === 'personal' && item.id === 'pension')!.base.mappingSourceIds = [];
  const zeroRule = bjRule(); zeroRule.personalZeroBurdenSourceIds = [];
  const dateRule = bjRule(); dateRule.items.find((item) => item.payer === 'personal' && item.id === 'medical')!.scope = { ...dateRule.scope, validFrom: '2026-10-16' };
  for (const rule of [sourceRule, mappingRule, zeroRule, dateRule]) {
    const result = calculateAutoContributionScenario(input, [rule]);
    assert.notEqual(result.personal.status, 'complete'); assert.ok(!result.lines.some((row) => row.id === 'before-tax'));
  }
  const broken = bjRule(); broken.scope.validTo = '2026-11-31';
  assert.equal(calculateAutoContributionScenario(input, [broken]).personal.status, 'unavailable');
});
test('未知城市/月/身份、非法金额、重复规则拒算；无规则保持未开放不使用其他城市值', () => {
  for (const variant of [
    { ...input, city: 'unknown' }, { ...input, month: '2026-09' }, { ...input, month: '2026-11' },
    { ...input, assumptions: undefined },
    ...[-1, NaN, Infinity, 0.1, Number.MAX_SAFE_INTEGER].map((grossCents) => ({ ...input, grossCents })),
  ]) assert.equal(calculateAutoContributionScenario(variant as AutoContributionScenarioInput, LABOR_AUTO_CONTRIBUTION_RULES).personal.status, 'unavailable');
  assert.equal(calculateAutoContributionScenario(input).personal.status, 'unavailable');
  assert.equal(calculateAutoContributionScenario({ ...input, city: 'shanghai' }, [bjRule()]).personal.status, 'unavailable');
  assert.equal(calculateAutoContributionScenario(input, [bjRule(), bjRule()]).personal.status, 'unavailable');
});

/** Synthetic geographic fixtures exercise selection only, not production Wenzhou policy. */
function areaRules(): AutoContributionRule[] {
  return [['测试甲', 266000], ['测试乙', 218000]].map(([area, minimum]) => {
    const rule = bjRule(); rule.id = `area-${area}`; rule.city = 'wenzhou'; rule.area = String(area);
    rule.scope = { ...rule.scope, region: String(area) };
    rule.items = rule.items.filter((item) => item.id === 'pension' || item.id === 'housing').map((item) => ({ ...item, minimumGrossAfterPersonalHousingCents: undefined, scope: { ...rule.scope }, base: { ...item.base, minimumCents: item.id === 'housing' ? Number(minimum) : 512200 } }));
    return rule;
  });
}
test('未选温州区县时同额项目可显示，区县差异只阻该项，不默认城区', () => {
  const high = calculateAutoContributionScenario({ ...input, city: 'wenzhou' }, areaRules());
  assert.equal(amount(high, 'personal-pension'), 80000); assert.equal(amount(high, 'personal-housing'), 50000);
  assert.ok(high.lines.every((row) => row.scope.region.includes('测试甲') && row.scope.region.includes('测试乙')));
  const low = calculateAutoContributionScenario({ ...input, city: 'wenzhou', priorAverageWageCents: 100000 }, areaRules());
  assert.equal(amount(low, 'personal-pension'), 40976);
  assert.ok(!low.lines.some((row) => row.id === 'personal-housing'));
  assert.ok(low.personal.missing.some((item) => item.itemId === 'housing' && item.reason.includes('选择所在县区')));
  const selected = calculateAutoContributionScenario({ ...input, city: 'wenzhou', priorAverageWageCents: 100000, wenzhouArea: '测试甲' }, areaRules());
  assert.equal(amount(selected, 'personal-housing'), 13300);
});
test('区域比较不会以缺失/非法区域规则视为零，不拿不同金额平均', () => {
  const rules = areaRules(); rules[1].items = rules[1].items.filter((item) => item.id !== 'housing');
  const result = calculateAutoContributionScenario({ ...input, city: 'wenzhou' }, rules);
  assert.equal(amount(result, 'personal-pension'), 80000);
  assert.ok(!result.lines.some((row) => row.id === 'personal-housing'));
  assert.ok(!result.lines.some((row) => row.id === 'personal-total'));
});
test('所有真实金额来源可解析，当前月份及方案可追溯，不变更输入或规则', () => {
  const rule = bjRule(); const before = structuredClone(rule); const inputBefore = structuredClone(input);
  const result = calculateAutoContributionScenario(input, [rule]);
  assert.ok(result.coverage.length > 0);
  for (const row of result.lines) {
    assert.ok(row.formula && row.scope.population && row.scope.verifiedOn);
    assert.ok(row.sourceIds.length > 0 && row.sourceIds.every((id) => !!LABOR_SOURCES[id]));
  }
  assert.ok(result.assumptions.some((text) => text.includes('不是经办资格核定')));
  assert.deepEqual(rule, before); assert.deepEqual(input, inputBefore);
});

test('北京低薪边界同时防上年月均/当前月薪变化，显式基数不能绕过支持范围', () => {
  for (const variant of [
    { ...input, priorAverageWageCents: 200000 },
    { ...input, grossCents: 200000 },
    { ...input, priorAverageWageCents: 200000, socialBaseCents: 1000000, housingBaseCents: 1000000 },
    { ...input, priorAverageWageCents: NaN, socialBaseCents: 1000000, housingBaseCents: 1000000 },
  ]) {
    const result = calculateAutoContributionScenario(variant, [bjRule()]);
    assert.ok(result.personal.missing.some((item) => item.itemId === 'housing'));
    assert.ok(!result.lines.some((row) => row.id === 'before-tax'));
    assert.ok(result.employer.lines.some((row) => row.id === 'employer-housing'));
  }
});

test('标准项目全有但存在额外待核支付时不输出完整单位成本', () => {
  const rule = bjRule();
  const withInjury = { ...input, employerInjuryRateBps: 20, employerInjuryRateConfirmed: true };
  rule.extraMissing = [];
  assert.equal(calculateAutoContributionScenario(withInjury, [rule]).employer.status, 'complete');
  rule.extraMissing = [{ payer: 'employer', reason: '测试：另有尚未核验的大额互助缴费' }];
  const result = calculateAutoContributionScenario(withInjury, [rule]);
  assert.equal(result.personal.status, 'complete'); assert.equal(result.employer.status, 'partial');
  assert.ok(result.employer.missing.some((item) => item.itemId === 'scope' && item.reason.includes('大额互助')));
  assert.ok(!result.lines.some((row) => row.id === 'company-cost'));
});

test('北京核定最终工伤0.2%才闭合单位3150/公司13150，未填或未确认不默认费率', () => {
  const result = calculateAutoContributionScenario({ ...input, employerInjuryRateBps: 20, employerInjuryRateConfirmed: true }, LABOR_AUTO_CONTRIBUTION_RULES);
  assert.equal(result.employer.status, 'complete');
  assert.equal(amount(result, 'employer-injury'), 2000);
  assert.equal(amount(result, 'employer-total'), 315000);
  assert.equal(amount(result, 'company-cost'), 1315000);
  assert.equal(amount(result, 'personal-total'), 155300);
  for (const patch of [{ employerInjuryRateBps: 20 }, { employerInjuryRateConfirmed: true }, { employerInjuryRateBps: 20, employerInjuryRateConfirmed: false }]) {
    const failed = calculateAutoContributionScenario({ ...input, ...patch }, LABOR_AUTO_CONTRIBUTION_RULES);
    assert.equal(failed.personal.status, 'complete'); assert.equal(failed.employer.status, 'partial');
    assert.ok(!failed.lines.some((row) => row.id === 'company-cost'));
  }
});
test('工伤最终率精度与技术域显式验证，分以下尾差只拒工伤，不再次按行业浮动', () => {
  for (const employerInjuryRateBps of [0, -1, 0.5, NaN, 10001]) {
    const result = calculateAutoContributionScenario({ ...input, employerInjuryRateBps, employerInjuryRateConfirmed: true }, LABOR_AUTO_CONTRIBUTION_RULES);
    assert.ok(!result.lines.some((row) => row.id === 'employer-injury'));
    assert.equal(result.personal.status, 'complete');
  }
  const exact = calculateAutoContributionScenario({ ...input, employerInjuryRateBps: 500, employerInjuryRateConfirmed: true }, LABOR_AUTO_CONTRIBUTION_RULES);
  assert.equal(amount(exact, 'employer-injury'), 50000);
  const tail = calculateAutoContributionScenario({ ...input, priorAverageWageCents: 1000100, employerInjuryRateBps: 1, employerInjuryRateConfirmed: true }, LABOR_AUTO_CONTRIBUTION_RULES);
  assert.ok(tail.employer.missing.some((item) => item.itemId === 'injury' && item.reason.includes('尾差')));
});

test('整元精确子域不借其他城市舍入：10000/5%可算，10010半元拒该公积金项目', () => {
  const rule = bjRule();
  for (const item of rule.items.filter((item) => item.id === 'housing')) item.rounding = 'exact-yuan';
  assert.equal(amount(calculateAutoContributionScenario(input, [rule]), 'personal-housing'), 50000);
  const result = calculateAutoContributionScenario({ ...input, grossCents: 1001000, priorAverageWageCents: 1001000 }, [rule]);
  assert.ok(result.personal.missing.some((item) => item.itemId === 'housing' && item.reason.includes('不是整元')));
  assert.ok(!result.lines.some((row) => row.id === 'personal-total'));
  assert.equal(amount(result, 'personal-pension'), 80080);
});
