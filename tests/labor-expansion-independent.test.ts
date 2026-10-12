import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateHousingFund, type HousingFundInput, type HousingFundRule } from '../lib/labor-housing-fund.ts';
import type { CalculationResult } from '../lib/labor-engine.ts';
import { calculateFlexibleContributions, type FlexibleContributionInput, type FlexibleContributionRule } from '../lib/labor-flexible-contributions.ts';
import { LABOR_HOUSING_FUND_RULES, LABOR_FLEXIBLE_CONTRIBUTION_RULES, LABOR_PENSION_COMPONENT_RULES, LABOR_SOURCES, LABOR_RULE_FIELDS } from '../lib/labor-rules.ts';
import { calculateBasicPensionComponent, calculateAccountPensionComponent, type PensionComponentRule } from '../lib/labor-pension-components.ts';

// Independent reviewer fixtures: policy arithmetic only; never exported as live rules.
const wz: HousingFundRule = {
  id: 'independent-wz-normal', regime: 'employee', calculation: 'employee-equal-share',
  minimumBaseCents: 218000, maximumBaseCents: 3296400, baseStepCents: 100,
  minimumRateBps: 500, maximumRateBps: 1200, rateStepBps: 1,
  precisionNote: '核定整数元基数是本版子集，不是替代法定基数取整规则。',
  sourceIds: ['independent-wenzhou-official-2026'],
  scope: { region: '温州-下限2180档', population: '正常企业已核定且无例外', validFrom: '2026-07-01', validTo: '2027-06-30', verifiedOn: '2026-10-12' },
};
const flex: HousingFundRule = { ...wz, id: 'independent-wz-flex', regime: 'flexible', calculation: 'flexible-half-rounded', minimumRateBps: 1000, maximumRateBps: 2400 };
const bj: HousingFundRule = { ...wz, id: 'independent-bj-normal', minimumBaseCents: 254000, maximumBaseCents: 3634800, rateStepBps: 100 };
const input: HousingFundInput = { month: '2026-10', confirmedBaseCents: 300500, confirmedRateBps: 1000, populationAndParametersConfirmed: true, specialCase: 'none' };
function amount(result: CalculationResult, id: string): number {
  assert.ok(result.ok, JSON.stringify(result)); if (!result.ok) throw new Error('unreachable');
  const row = result.lines.find((line) => line.id === id); assert.ok(row, id); return row.amountCents;
}
test('独立扩围公积金：逐方0.4/0.5/0.6元尾差，不合计再四舍五入', () => {
  for (const [base, share] of [[300400, 30000], [300500, 30100], [300600, 30100]]) {
    for (const rule of [wz, bj]) {
      const result = calculateHousingFund({ ...input, confirmedBaseCents: base }, rule);
      assert.equal(amount(result, 'housing-fund-personal'), share);
      assert.equal(amount(result, 'housing-fund-employer'), share);
      assert.equal(amount(result, 'housing-fund-total'), share * 2);
    }
    const result = calculateHousingFund({ ...input, confirmedBaseCents: base, confirmedRateBps: 2000, hasOutstandingHousingFundLoan: false }, flex);
    assert.equal(amount(result, 'housing-fund-total'), share * 2);
    if (result.ok) assert.deepEqual(result.lines.map((line) => line.id), ['housing-fund-total']);
  }
});
test('独立扩围：温州县区下限和灵活总率语义，北京官方附件顶额', () => {
  for (const [minimum, expected] of [[266000, 26600], [243000, 24400], [218000, 21800]]) {
    assert.equal(amount(calculateHousingFund({ ...input, confirmedBaseCents: minimum, confirmedRateBps: 500 }, { ...wz, minimumBaseCents: minimum }), 'housing-fund-total'), expected);
    assert.equal(amount(calculateHousingFund({ ...input, confirmedBaseCents: minimum, confirmedRateBps: 1000, hasOutstandingHousingFundLoan: false }, { ...flex, minimumBaseCents: minimum }), 'housing-fund-total'), expected);
  }
  assert.equal(amount(calculateHousingFund({ ...input, confirmedBaseCents: 3296400, confirmedRateBps: 2400, hasOutstandingHousingFundLoan: false }, flex), 'housing-fund-total'), 791200);
  for (const [rate, expected] of [[500, 363400], [600, 436200], [700, 508800], [800, 581600], [900, 654200], [1000, 727000], [1100, 799600], [1200, 872400]]) {
    assert.equal(amount(calculateHousingFund({ ...input, confirmedBaseCents: 3634800, confirmedRateBps: rate }, bj), 'housing-fund-total'), expected);
  }
});
test('独立扩围精度：温州5.01%精算，超产品基数/比例精度不悄悄改写', () => {
  assert.equal(amount(calculateHousingFund({ ...input, confirmedBaseCents: 1000700, confirmedRateBps: 501 }, wz), 'housing-fund-total'), 100200);
  assert.equal(amount(calculateHousingFund({ ...input, confirmedBaseCents: 1001000, confirmedRateBps: 501 }, wz), 'housing-fund-total'), 100400);
  for (const patch of [{ confirmedBaseCents: 300501 }, { confirmedRateBps: 500.5 }, { confirmedBaseCents: NaN }, { confirmedBaseCents: 3296500 }]) assert.equal(calculateHousingFund({ ...input, ...patch }, wz).ok, false);
  assert.equal(calculateHousingFund({ ...input, confirmedRateBps: 501 }, bj).ok, false);
});
test('独立扩围拒算：确认不能绕过例外、未知贷款、日期范围或残缺证据', () => {
  for (const specialCase of ['unknown', 'special-center', 'personal-reduced-or-exempt', 'reduced-or-deferred', 'adjustment-or-refund', 'government-or-public-institution'] as const) assert.equal(calculateHousingFund({ ...input, specialCase }, wz).ok, false);
  for (const status of [undefined, true]) assert.equal(calculateHousingFund({ ...input, hasOutstandingHousingFundLoan: status }, flex).ok, false);
  assert.equal(calculateHousingFund({ ...input, populationAndParametersConfirmed: false }, wz).ok, false);
  for (const month of ['2026-06', '2027-07', '2026-13']) assert.equal(calculateHousingFund({ ...input, month }, wz).ok, false);
  for (const month of ['2026-07', '2027-06']) assert.equal(calculateHousingFund({ ...input, month }, wz).ok, true);
  for (const rule of [{ ...wz, sourceIds: [] }, { ...wz, precisionNote: '' }, { ...wz, scope: { ...wz.scope, verifiedOn: '2026-02-30' } }]) assert.equal(calculateHousingFund(input, rule).ok, false);
});
test('独立扩围输出证据完整、输入不变；职工不读取无关贷款状态', () => {
  const employee = { ...input };
  Object.defineProperty(employee, 'hasOutstandingHousingFundLoan', { enumerable: true, get() { throw new Error('职工路径不得读取贷款字段'); } });
  const result = calculateHousingFund(employee, wz);
  assert.equal(amount(result, 'housing-fund-total'), 60200);
  if (result.ok) for (const line of result.lines) { assert.ok(line.formula); assert.deepEqual(line.sourceIds, wz.sourceIds); assert.deepEqual(line.scope, wz.scope); }
  assert.equal(employee.confirmedBaseCents, 300500);
});

const bjFlex: FlexibleContributionRule = {
  id: 'independent-bj-specified-channel', sourceIds: ['notice2026', 'rate2026'],
  scope: { region: '北京', population: '指定渠道个人已核定组合', validFrom: '2026-10-01', validTo: '2026-10-31', verifiedOn: '2026-10-12' },
  supportedChannels: ['经办核定通知限定渠道'], minimumBaseYuan: 7270, maximumBaseYuan: 36348,
  pensionRateBps: 2000, unemploymentRateBps: 100, medicalFixedCents: 59368,
  itemSourceIds: { pension: ['notice2026', 'rate2026'], unemployment: ['notice2026', 'rate2026'], medical: ['notice2026'] },
};
const bjFlexInput: FlexibleContributionInput = {
  month: '2026-10', channel: bjFlex.supportedChannels[0], populationAndEnrollmentConfirmed: true,
  specialCase: 'none', enrollment: { pension: 'enrolled', unemployment: 'enrolled', medical: 'enrolled' }, confirmedBaseYuan: 10001,
};
test('独立北京三险金值：奇数基数逐项精确，下上限与只养老失业分开', () => {
  for (const [base, pension, unemployment, total] of [[7270, 145400, 7270, 212038], [36348, 726960, 36348, 822676], [10001, 200020, 10001, 269389]]) {
    const result = calculateFlexibleContributions({ ...bjFlexInput, confirmedBaseYuan: base }, bjFlex);
    assert.equal(amount(result, 'flexible-pension'), pension);
    assert.equal(amount(result, 'flexible-unemployment'), unemployment);
    assert.equal(amount(result, 'flexible-medical'), 59368);
    assert.equal(amount(result, 'flexible-selected-total'), total);
  }
  const pair = calculateFlexibleContributions({ ...bjFlexInput, enrollment: { pension: 'enrolled', unemployment: 'enrolled', medical: 'not-enrolled' } }, bjFlex);
  assert.equal(amount(pair, 'flexible-selected-total'), 210021);
  if (pair.ok) assert.ok(!pair.lines.some((line) => line.id === 'flexible-medical'));
});
test('独立北京三险隔离：只医保不读基数、不假设未参加项目为零权益', () => {
  const input: FlexibleContributionInput = { ...bjFlexInput, enrollment: { pension: 'not-enrolled', unemployment: 'not-enrolled', medical: 'enrolled' } };
  Object.defineProperty(input, 'confirmedBaseYuan', { enumerable: true, get() { throw new Error('只医保不得读取基数'); } });
  const rule = { ...bjFlex };
  for (const field of ['minimumBaseYuan', 'maximumBaseYuan', 'pensionRateBps', 'unemploymentRateBps']) Object.defineProperty(rule, field, { get() { throw new Error('不得读取未选规则'); } });
  const result = calculateFlexibleContributions(input, rule);
  assert.equal(amount(result, 'flexible-selected-total'), 59368);
  if (result.ok) { assert.equal(result.lines.length, 2); assert.deepEqual(result.lines[1].sourceIds, ['notice2026']); }
});
test('独立北京三险拒算：任何未知、非限定渠道、特殊补贴、分以下尾差及缺所选证据', () => {
  for (const insurance of ['pension', 'unemployment', 'medical'] as const) assert.equal(calculateFlexibleContributions({ ...bjFlexInput, enrollment: { ...bjFlexInput.enrollment, [insurance]: 'unknown' } }, bjFlex).ok, false);
  for (const patch of [{ channel: '' }, { channel: '任意灵活就业' }, { populationAndEnrollmentConfirmed: false }, { specialCase: 'subsidy-or-exemption' as const }, { confirmedBaseYuan: undefined }, { confirmedBaseYuan: 10001.1 }, { month: '2027-01' }]) assert.equal(calculateFlexibleContributions({ ...bjFlexInput, ...patch }, bjFlex).ok, false);
  assert.equal(calculateFlexibleContributions(bjFlexInput, { ...bjFlex, pensionRateBps: 1 }).ok, false);
  assert.equal(calculateFlexibleContributions(bjFlexInput, { ...bjFlex, itemSourceIds: { ...bjFlex.itemSourceIds, medical: [] } }).ok, false);
});

test('独立真实规则：北京八档上限、温州全部县区下限，法定所属期不误用办理日', () => {
  assert.equal(LABOR_HOUSING_FUND_RULES.length, 7);
  const beijing = LABOR_HOUSING_FUND_RULES.find((r) => r.id === 'bj-housing-employee-2026')!;
  for (const [rate, expected] of [[500, 363400], [600, 436200], [700, 508800], [800, 581600], [900, 654200], [1000, 727000], [1100, 799600], [1200, 872400]]) assert.equal(amount(calculateHousingFund({ ...input, confirmedBaseCents: 3634800, confirmedRateBps: rate }, beijing), 'housing-fund-total'), expected);
  for (const [group, minimum, region, total] of [['a', 266000, '鹿城、龙湾、瓯海、洞头、温州海洋经济发展示范区', 26600], ['b', 243000, '乐清、瑞安', 24400], ['c', 218000, '永嘉、文成、平阳、泰顺、苍南、龙港', 21800]] as const) {
    for (const mode of ['employee', 'flexible']) {
      const rule = LABOR_HOUSING_FUND_RULES.find((r) => r.id === `wz-housing-${group}-${mode}-2026`)!;
      assert.equal(rule.minimumBaseCents, minimum); assert.equal(rule.maximumBaseCents, 3296400); assert.equal(rule.scope.region, `温州 · ${region}`);
      for (const month of ['2026-07', '2027-06']) assert.equal(amount(calculateHousingFund({ ...input, month, confirmedBaseCents: minimum, confirmedRateBps: mode === 'employee' ? 500 : 1000, hasOutstandingHousingFundLoan: false }, rule), 'housing-fund-total'), total);
      assert.equal(calculateHousingFund({ ...input, confirmedBaseCents: minimum - 100, hasOutstandingHousingFundLoan: false }, rule).ok, false);
    }
  }
});

test('独立真实规则：限定北京三险现金支出、来源与逐字段映射完整', () => {
  assert.equal(LABOR_FLEXIBLE_CONTRIBUTION_RULES.length, 1);
  const rule = LABOR_FLEXIBLE_CONTRIBUTION_RULES[0];
  for (const channel of rule.supportedChannels) for (const [confirmedBaseYuan, expected] of [[7270, 212038], [36348, 822676], [10001, 269389]]) assert.equal(amount(calculateFlexibleContributions({ ...bjFlexInput, channel, confirmedBaseYuan }, rule), 'flexible-selected-total'), expected);
  for (const rule of [...LABOR_HOUSING_FUND_RULES, ...LABOR_FLEXIBLE_CONTRIBUTION_RULES]) {
    assert.equal(rule.scope.verifiedOn, '2026-10-12'); assert.ok(rule.scope.population);
    for (const id of rule.sourceIds) {
      const source = LABOR_SOURCES[id]; assert.ok(source, id); assert.match(source.url, /^https:\/\//); assert.ok(source.authority); assert.ok(source.scope); assert.ok(source.verifiedAt);
      assert.ok(LABOR_RULE_FIELDS.some((field) => field.sourceIds.includes(id)), `field mapping ${id}`);
    }
  }
});

const componentRule: PensionComponentRule = {
  id: 'independent-component', region: 'zhejiang', supportedYear: 2026, basicRateBps: 100,
  sourceIds: ['zj-formula', 'national-table'], componentSourceIds: { basic: ['zj-formula'], account: ['zj-formula', 'national-table'] },
  scope: { region: '浙江含温州', population: '经办确认普通新人分项适用，无历史特殊', validFrom: '2026-01-01', validTo: '2026-12-31', verifiedOn: '2026-10-12' },
  precisionNote: '两位年限为已核定值输入子集，不宣称浙江法定舍入方向。', accountDivisors: { 50: 195, 60: 139, 66: 93 },
};
const componentInput = { ruleDate: '2026-10-12', parametersConfirmed: true, componentApplicableConfirmed: true, specialCase: 'none' as const };
test('独立养老金分项：B是已处理均值，不再除2；N是经办两位值，不折算月数', () => {
  for (const [b, n, expected] of [[853700, 2000, 170740], [1000000, 2008, 200800]]) {
    const result = calculateBasicPensionComponent({ ...componentInput, confirmedCalculationWageCents: b, confirmedServiceYearsHundredths: n }, componentRule);
    assert.equal(amount(result, 'pension-basic-component-review'), expected);
    if (result.ok) { assert.equal(result.lines.length, 1); assert.deepEqual(result.lines[0].sourceIds, ['zj-formula']); assert.match(result.warnings.join(' '), /不是完整月养老金/); }
  }
  for (const [b, n] of [[857968, 2000], [1000000, 4000], [1000000, 1499], [1000000, 2000.5]]) assert.equal(calculateBasicPensionComponent({ ...componentInput, confirmedCalculationWageCents: b, confirmedServiceYearsHundredths: n }, componentRule).ok, false);
});
test('独立养老金账户：不能拿可领取年限替代D、非整岁和一分尾差精确拒算', () => {
  const account = { ...componentInput, confirmedBalanceCents: 13900000, confirmedRetirementAgeYears: 60, confirmedDivisorMonths: 139 };
  assert.equal(amount(calculateAccountPensionComponent(account, componentRule), 'pension-account-component-review'), 100000);
  for (const patch of [{ confirmedBalanceCents: 10000000 }, { confirmedBalanceCents: 13900001 }, { confirmedRetirementAgeYears: 60.1 }, { confirmedDivisorMonths: 120 }, { confirmedRetirementAgeYears: 67 }, { ruleDate: '2027-01-01' }, { ruleDate: '2026-02-30' }, { parametersConfirmed: false }, { componentApplicableConfirmed: false }, { specialCase: 'unknown' as const }]) assert.equal(calculateAccountPensionComponent({ ...account, ...patch }, componentRule).ok, false);
});
test('独立养老金分项隔离：只读所选参数及来源，永不补零并合计', () => {
  const basic = { ...componentInput, confirmedCalculationWageCents: 1000000, confirmedServiceYearsHundredths: 2000 };
  const account = { ...componentInput, confirmedBalanceCents: 13900000, confirmedRetirementAgeYears: 60, confirmedDivisorMonths: 139 };
  for (const field of ['confirmedBalanceCents', 'confirmedRetirementAgeYears', 'confirmedDivisorMonths']) Object.defineProperty(basic, field, { get() { throw new Error('基础分项不得读账户参数'); } });
  for (const field of ['confirmedCalculationWageCents', 'confirmedServiceYearsHundredths']) Object.defineProperty(account, field, { get() { throw new Error('账户分项不得读基础参数'); } });
  assert.equal(amount(calculateBasicPensionComponent(basic, componentRule), 'pension-basic-component-review'), 200000);
  assert.equal(amount(calculateAccountPensionComponent(account, componentRule), 'pension-account-component-review'), 100000);
  assert.equal(calculateBasicPensionComponent(basic, { ...componentRule, componentSourceIds: { basic: [], account: ['national-table'] } }).ok, false);
  assert.equal(calculateAccountPensionComponent(account, { ...componentRule, componentSourceIds: { basic: ['zj-formula'], account: ['unregistered'] } }).ok, false);
});

test('独立真实京浙分项：官方整岁计发月数全表、单项金值、公式及逐字段来源', () => {
  assert.equal(LABOR_PENSION_COMPONENT_RULES.length, 2);
  const divisors = [195, 190, 185, 180, 175, 170, 164, 158, 152, 145, 139, 132, 125, 117, 109, 101, 93];
  for (const rule of LABOR_PENSION_COMPONENT_RULES) {
    assert.equal(rule.supportedYear, 2026); assert.equal(rule.scope.validFrom, '2026-01-01'); assert.equal(rule.scope.validTo, '2026-12-31');
    assert.equal(amount(calculateBasicPensionComponent({ ...componentInput, confirmedCalculationWageCents: 853700, confirmedServiceYearsHundredths: 2000 }, rule), 'pension-basic-component-review'), 170740);
    for (const [index, divisor] of divisors.entries()) {
      assert.equal(rule.accountDivisors[index + 50], divisor);
      const result = calculateAccountPensionComponent({ ...componentInput, confirmedBalanceCents: divisor * 100000, confirmedRetirementAgeYears: index + 50, confirmedDivisorMonths: divisor }, rule);
      assert.equal(amount(result, 'pension-account-component-review'), 100000);
      if (result.ok) { assert.equal(result.lines.length, 1); assert.deepEqual(result.lines[0].sourceIds, rule.componentSourceIds.account); assert.deepEqual(result.lines[0].scope, rule.scope); }
    }
    for (const ids of Object.values(rule.componentSourceIds)) for (const id of ids) {
      assert.ok(rule.sourceIds.includes(id)); const source = LABOR_SOURCES[id]; assert.ok(source, id);
      assert.match(source.url, /^https:\/\//); assert.ok(source.authority); assert.ok(source.title); assert.ok(source.scope); assert.equal(source.verifiedAt, '2026-10-12');
      assert.ok(LABOR_RULE_FIELDS.some((field) => field.sourceIds.includes(id)), id);
    }
    assert.ok(!rule.sourceIds.includes('sh-pension-2026'));
  }
  assert.ok(LABOR_PENSION_COMPONENT_RULES.find((r) => r.region === 'zhejiang')!.sourceIds.includes('zj-pension-provincial'));
});
