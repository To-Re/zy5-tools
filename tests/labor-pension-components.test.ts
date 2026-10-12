import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBasicPensionComponent, calculateAccountPensionComponent, type PensionComponentRule, type BasicPensionComponentInput, type AccountPensionComponentInput, type PensionComponentCommonInput } from '../lib/labor-pension-components.ts';
import type { CalculationResult } from '../lib/labor-engine.ts';
import { LABOR_PENSION_COMPONENT_RULES, LABOR_SOURCES } from '../lib/labor-rules.ts';

// Pure arithmetic fixtures. Production policy records and source admission are reviewed separately.
const rule: PensionComponentRule = {
  id: 'fixture-bj-components', region: 'beijing', supportedYear: 2026, basicRateBps: 100,
  sourceIds: ['fixture-basic-formula', 'fixture-account-formula', 'fixture-divisor'],
  componentSourceIds: { basic: ['fixture-basic-formula'], account: ['fixture-account-formula', 'fixture-divisor'] },
  scope: { region: '北京', population: '经办核定普通新人分项、无特殊身份', validFrom: '2026-01-01', validTo: '2026-12-31', verifiedOn: '2026-10-12' },
  accountDivisors: { 50: 195, 60: 139, 66: 93 }, precisionNote: '仅收经办已处理的中间值；不会自行从月份折算年限。',
};
const common: PensionComponentCommonInput = { ruleDate: '2026-10-12', parametersConfirmed: true, componentApplicableConfirmed: true, specialCase: 'none' };
const basic: BasicPensionComponentInput = { ...common, confirmedCalculationWageCents: 853700, confirmedServiceYearsHundredths: 2000 };
const account: AccountPensionComponentInput = { ...common, confirmedBalanceCents: 13900000, confirmedRetirementAgeYears: 60, confirmedDivisorMonths: 139 };
function value(result: CalculationResult, expectedId: string): number {
  assert.ok(result.ok, JSON.stringify(result)); if (!result.ok) throw new Error('unreachable');
  assert.equal(result.lines.length, 1); assert.equal(result.lines[0].id, expectedId);
  return result.lines[0].amountCents;
}
const basicAmount = (result: CalculationResult) => value(result, 'pension-basic-component-review');
const accountAmount = (result: CalculationResult) => value(result, 'pension-account-component-review');

test('基础中间值直接运算：8537×20×1%=1707.40，不再除2或乘指数', () => {
  assert.equal(basicAmount(calculateBasicPensionComponent(basic, rule)), 170740);
  assert.equal(basicAmount(calculateBasicPensionComponent({ ...basic, confirmedCalculationWageCents: 1000000, confirmedServiceYearsHundredths: 2008 }, rule)), 200800);
});
test('核定B8579.68和20年产生1715.936，需要未知舍入即拒算', () => {
  const result = calculateBasicPensionComponent({ ...basic, confirmedCalculationWageCents: 857968 }, rule);
  assert.equal(result.ok, false); if (!result.ok) assert.match(result.errors.join(), /不能恰好到角/);
  // Exactly one cent, but not one jiao, is also outside this intentionally narrow review domain.
  assert.equal(calculateBasicPensionComponent({ ...basic, confirmedCalculationWageCents: 1000005 }, rule).ok, false);
});
test('账户139000÷139=1000整角通过，100000÷139不可擅给719.42', () => {
  assert.equal(accountAmount(calculateAccountPensionComponent(account, rule)), 100000);
  assert.equal(calculateAccountPensionComponent({ ...account, confirmedBalanceCents: 10000000 }, rule).ok, false);
  assert.equal(calculateAccountPensionComponent({ ...account, confirmedBalanceCents: 13900139 }, rule).ok, false);
  assert.equal(accountAmount(calculateAccountPensionComponent({ ...account, confirmedBalanceCents: 13901390 }, rule)), 100010);
});
test('分项完全独立：基础失败不阻塞账户，未选参数/规则getter不读取', () => {
  const basicRule = { ...rule };
  Object.defineProperty(basicRule, 'accountDivisors', { get() { throw new Error('Basic must not read account divisor.'); } });
  assert.equal(basicAmount(calculateBasicPensionComponent(basic, basicRule)), 170740);
  const accountRule = { ...rule };
  for (const field of ['basicRateBps', 'precisionNote']) Object.defineProperty(accountRule, field, { get() { throw new Error('Account must not read basic parameters.'); } });
  assert.equal(accountAmount(calculateAccountPensionComponent(account, accountRule)), 100000);
  assert.equal(calculateBasicPensionComponent({ ...basic, confirmedCalculationWageCents: 857968 }, rule).ok, false);
  assert.equal(accountAmount(calculateAccountPensionComponent(account, rule)), 100000);
});
test('新人2026年限15—28年产品范围，不接受40年或非两位核定年限', () => {
  for (const years of [1499, 2801, 4000, 2000.1, NaN, Infinity]) assert.equal(calculateBasicPensionComponent({ ...basic, confirmedServiceYearsHundredths: years }, rule).ok, false);
  for (const years of [1500, 2800]) assert.equal(calculateBasicPensionComponent({ ...basic, confirmedCalculationWageCents: 1000000, confirmedServiceYearsHundredths: years }, rule).ok, true);
});
test('整岁50—66及经办已核D双重检查，不插值/进岁/猜值', () => {
  for (const age of [49, 67, 60.5, NaN]) assert.equal(calculateAccountPensionComponent({ ...account, confirmedRetirementAgeYears: age }, rule).ok, false);
  assert.equal(calculateAccountPensionComponent({ ...account, confirmedDivisorMonths: 138 }, rule).ok, false);
  assert.equal(calculateAccountPensionComponent({ ...account, confirmedRetirementAgeYears: 61, confirmedDivisorMonths: 132 }, rule).ok, false);
  assert.equal(accountAmount(calculateAccountPensionComponent({ ...account, confirmedRetirementAgeYears: 66, confirmedDivisorMonths: 93, confirmedBalanceCents: 9300000 }, rule)), 100000);
});
test('确认未知、非普通身份、视同/过渡不能由其他确认覆盖', () => {
  const changes: Partial<PensionComponentCommonInput>[] = [{ parametersConfirmed: false }, { componentApplicableConfirmed: false }, { specialCase: 'unknown' }, { specialCase: 'transitional-or-deemed' }, { specialCase: 'special-population' }];
  for (const change of changes) {
    assert.equal(calculateBasicPensionComponent({ ...basic, ...change }, rule).ok, false);
    assert.equal(calculateAccountPensionComponent({ ...account, ...change }, rule).ok, false);
  }
});
test('只限北京浙江2026，非法日期、缺源/错源、非法参数不能通过', () => {
  for (const date of ['2025-12-31', '2027-01-01', '2026-09-31', '']) {
    assert.equal(calculateBasicPensionComponent({ ...basic, ruleDate: date }, rule).ok, false);
    assert.equal(calculateAccountPensionComponent({ ...account, ruleDate: date }, rule).ok, false);
  }
  assert.equal(calculateBasicPensionComponent(basic).ok, false);
  assert.equal(calculateBasicPensionComponent(basic, { ...rule, region: 'shanghai' as PensionComponentRule['region'] }).ok, false);
  assert.equal(calculateAccountPensionComponent(account, { ...rule, componentSourceIds: { ...rule.componentSourceIds, account: ['unknown-source'] } }).ok, false);
  assert.equal(calculateBasicPensionComponent(basic, { ...rule, precisionNote: '' }).ok, false);
  for (const bad of [-1, 0, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(calculateBasicPensionComponent({ ...basic, confirmedCalculationWageCents: bad }, rule).ok, false);
});
test('浙江两位年限仅输入产品子集，结果只带该分项来源且没有总额', () => {
  const zj: PensionComponentRule = { ...rule, id: 'fixture-zj', region: 'zhejiang', scope: { ...rule.scope, region: '浙江（含温州）' }, precisionNote: '仅接受经办已核定两位年限作为产品子集，不声称浙江法规规定两位年月换算。' };
  const result = calculateBasicPensionComponent(basic, zj);
  assert.ok(result.ok); if (result.ok) {
    assert.equal(result.lines.length, 1); assert.deepEqual(result.lines[0].sourceIds, rule.componentSourceIds.basic);
    assert.ok(result.lines[0].formula.includes('不是C')); assert.equal(result.lines[0].amountCents % 10, 0);
    assert.ok(result.warnings.join().includes('不合计、不逆算目标、不计算累计领取'));
    assert.ok(result.warnings.join().includes('不声称浙江法规规定'));
  }
});

function broadBasicRule(): PensionComponentRule {
  return { ...rule, basicReviewEvidence: {
    sourceIds: ['fixture-basic-formula'],
    scope: { ...rule.scope, population: '经办已核定标准基础分项B/N的普通企业职工（含已认定视同）；不计算过渡分项或完整待遇' },
  } };
}
test('独立基础分项有专门准入与明确确认后，40年/尾月/小于15年只复核算式而非资格', () => {
  for (const years of [0, 500, 1499, 2808, 3500, 4000]) {
    const result = calculateBasicPensionComponent({ ...basic, basicReviewConfirmed: true,
      specialCase: 'transitional-or-deemed', confirmedCalculationWageCents: 1000000,
      confirmedServiceYearsHundredths: years }, broadBasicRule());
    assert.equal(basicAmount(result), years * 100);
    if (result.ok) {
      assert.match(result.lines[0].scope.population, /含已认定视同/);
      assert.match(result.warnings.join(), /不从N推断退休资格/);
      assert.ok(!result.lines.some((line) => line.id.includes('total')));
    }
  }
});
test('广域基础不能借旧新人包或其他确认自动打开；未知/特殊公式始终拒', () => {
  const broad = { ...basic, basicReviewConfirmed: true, confirmedServiceYearsHundredths: 4000 };
  assert.equal(calculateBasicPensionComponent(broad, rule).ok, false);
  assert.equal(calculateBasicPensionComponent({ ...broad, basicReviewConfirmed: false }, broadBasicRule()).ok, false);
  for (const patch of [{ parametersConfirmed: false }, { componentApplicableConfirmed: false },
    { specialCase: 'unknown' as const }, { specialCase: 'special-population' as const }]) {
    assert.equal(calculateBasicPensionComponent({ ...broad, ...patch }, broadBasicRule()).ok, false);
  }
  for (const evidence of [
    { sourceIds: [], scope: rule.scope },
    { sourceIds: ['unregistered'], scope: rule.scope },
    { sourceIds: ['fixture-basic-formula'], scope: { ...rule.scope, population: '' } },
    { sourceIds: ['fixture-basic-formula'], scope: { ...rule.scope, validTo: '2026-09-30' } },
  ]) assert.equal(calculateBasicPensionComponent(broad, { ...broadBasicRule(), basicReviewEvidence: evidence }).ok, false);
});
test('基础扩域仍保留年限百分年精度、精确角及技术溢出闸门，不改变个人账户域', () => {
  const broad = { ...basic, basicReviewConfirmed: true, confirmedCalculationWageCents: 1000000 };
  for (const years of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(calculateBasicPensionComponent({ ...broad, confirmedServiceYearsHundredths: years }, broadBasicRule()).ok, false);
  }
  const overflow = calculateBasicPensionComponent({ ...broad, confirmedServiceYearsHundredths: Number.MAX_SAFE_INTEGER }, broadBasicRule());
  assert.equal(overflow.ok, false);
  if (!overflow.ok) assert.match(overflow.errors.join(), /超出精确整数分/);
  assert.equal(calculateBasicPensionComponent({ ...broad, confirmedCalculationWageCents: 857968, confirmedServiceYearsHundredths: 4000 }, broadBasicRule()).ok, false);
  const accountWithBasicFlag = { ...account, basicReviewConfirmed: true, specialCase: 'transitional-or-deemed' as const };
  assert.equal(calculateAccountPensionComponent(accountWithBasicFlag, broadBasicRule()).ok, false);
  assert.equal(accountAmount(calculateAccountPensionComponent(account, broadBasicRule())), 100000);
});
test('北京浙江真实准入包：已核B10000和40年标准基础分项4000，来源专属且账户不扩', () => {
  for (const region of ['beijing', 'zhejiang'] as const) {
    const productionRule = LABOR_PENSION_COMPONENT_RULES.find((entry) => entry.region === region)!;
    assert.ok(productionRule.basicReviewEvidence);
    const result = calculateBasicPensionComponent({ ...basic, basicReviewConfirmed: true,
      specialCase: 'transitional-or-deemed', confirmedCalculationWageCents: 1000000,
      confirmedServiceYearsHundredths: 4000 }, productionRule);
    assert.equal(basicAmount(result), 400000);
    if (result.ok) {
      assert.deepEqual(result.lines[0].sourceIds, productionRule.basicReviewEvidence!.sourceIds);
      for (const id of result.lines[0].sourceIds) assert.ok(LABOR_SOURCES[id]?.url.startsWith('https://'));
      assert.match(result.lines[0].scope.population, /中人|视同/);
    }
    assert.equal(calculateAccountPensionComponent({ ...account, specialCase: 'transitional-or-deemed' }, productionRule).ok, false);
  }
});
