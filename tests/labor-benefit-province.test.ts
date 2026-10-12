import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBenefitProvince, type BenefitProvinceInput, type BenefitProvincePeriod, type BenefitProvinceRule } from '../lib/labor-benefit-province.ts';

// Fixtures isolate decision branches; actual citations and registry are supplied by the rules owner.
const rule: BenefitProvinceRule = {
  id: 'fixture-province-rule', qualifyingMonths: 120, minimumTotalMonthsByYear: { 2026: 180 }, supportedProvinces: ['北京', '上海', '浙江', '江苏', '广东'],
  sourceIds: ['fixture-66', 'fixture-2016-5'], scope: { region: '中国大陆', population: '普通职工，无特殊账户或归属', validFrom: '2026-01-01', validTo: '2026-12-31', verifiedOn: '2026-10-12' },
  branchSourceIds: { householdRelationship: ['fixture-66'], currentTenYears: ['fixture-66'], lastTenYears: ['fixture-66'], householdFallback: ['fixture-66', 'fixture-2016-5'], temporaryAccounts: ['fixture-66'] },
};
const period = (province: string, from: string, to: string, recognizedMonths: number, id = province): BenefitProvincePeriod => ({ id, province, from, to, recognizedMonths, accountKind: 'ordinary' });
const base: BenefitProvinceInput = {
  asOfDate: '2026-10-12', householdProvince: '浙江', ordinaryRelationshipProvince: '上海', currentParticipationProvince: '上海', currentAccountKind: 'ordinary', recordsConfirmed: true, eligibilityConfirmed: true, hasSpecialCircumstances: false, temporaryHandlingConfirmed: false,
  periods: [period('北京', '2006-01', '2015-12', 120), period('上海', '2016-01', '2026-09', 129)],
};
function assertProvince(input: BenefitProvinceInput, province: string, branch: string) {
  const result = calculateBenefitProvince(input, rule);
  assert.ok(result.ok, JSON.stringify(result));
  if (result.ok) {
    assert.equal(result.benefitProvince, province); assert.equal(result.branch, branch);
    assert.ok(result.sourceIds.length); assert.ok(result.steps.every((step) => step.sourceIds.length));
  }
}

test('户籍与正式关系同省，优先户籍，不要求当地单独10年', () => {
  assertProvince({ ...base, householdProvince: '上海', periods: [period('北京', '2006-01', '2020-12', 180), period('上海', '2021-01', '2026-09', 69)] }, '上海', 'household-relationship');
});
test('现正式关系省满120个月优先当前省，即使旧省也满10年', () => {
  assertProvince(base, '上海', 'current-ten-years');
});
test('现关系省119个月时退回最近一个满120个月的原省', () => {
  assertProvince({ ...base, periods: [period('北京', '2006-01', '2015-12', 120), period('上海', '2016-01', '2026-09', 119)] }, '北京', 'last-ten-years');
});
test('多个旧省满10年按最近普通关系顺序，不按总月数最大', () => {
  assertProvince({ ...base, periods: [period('北京', '1996-01', '2007-12', 144), period('江苏', '2008-01', '2018-12', 132), period('上海', '2019-01', '2026-09', 93)] }, '江苏', 'last-ten-years');
});
test('同省多次普通关系累计，最后经历先后决定原省顺序', () => {
  assertProvince({ ...base, periods: [period('北京', '1996-01', '2000-12', 60, 'bj1'), period('江苏', '2001-01', '2010-12', 120), period('北京', '2011-01', '2015-12', 60, 'bj2'), period('上海', '2016-01', '2026-09', 119)] }, '北京', 'last-ten-years');
});
test('所有省均不足120个月，回户籍省，即使户籍从未参保', () => {
  assertProvince({ ...base, periods: [period('北京', '2006-01', '2015-12', 119), period('上海', '2016-01', '2026-09', 119)] }, '浙江', 'household-fallback');
});
test('临时账户省不成为候选，即使填满10年或勾选处理已确认', () => {
  const result = calculateBenefitProvince({ ...base, ordinaryRelationshipProvince: '北京', currentAccountKind: 'temporary', temporaryHandlingConfirmed: true, periods: [base.periods[0], { ...base.periods[1], accountKind: 'temporary' }] }, rule);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.join(), /临时账户/);
});
test('特殊、未核定、不足总年限、无效省、市级输入、未知账户均拒绝', () => {
  const variants: BenefitProvinceInput[] = [
    { ...base, hasSpecialCircumstances: true }, { ...base, recordsConfirmed: false }, { ...base, eligibilityConfirmed: false }, { ...base, currentAccountKind: 'unknown' }, { ...base, householdProvince: '温州' },
    { ...base, periods: [period('北京', '2012-01', '2015-12', 48), period('上海', '2016-01', '2026-09', 120)] },
    { ...base, ordinaryRelationshipProvince: '北京' }, { ...base, currentParticipationProvince: '浙江' },
    { ...base, asOfDate: '2026-09-31' }, { ...base, asOfDate: '2027-01-01' },
  ];
  for (const variant of variants) assert.equal(calculateBenefitProvince(variant, rule).ok, false, JSON.stringify(variant));
});
test('重叠、重复、缺省、超过期间月数和未来经历拒绝，不靠勾选跳过', () => {
  const periods: BenefitProvincePeriod[][] = [
    [base.periods[0], period('上海', '2015-12', '2026-09', 129)],
    [base.periods[0], { ...base.periods[1], id: '北京' }],
    [base.periods[0], { ...base.periods[1], recognizedMonths: 130 }],
    [base.periods[0], { ...base.periods[1], to: '2026-11' }],
    [base.periods[0], { ...base.periods[1], recognizedMonths: 1.5 }],
  ];
  for (const record of periods) assert.equal(calculateBenefitProvince({ ...base, periods: record }, rule).ok, false);
});
test('输入排列不改变经核定年月先后结果；分支缺来源拒算', () => {
  assertProvince({ ...base, periods: [...base.periods].reverse() }, '上海', 'current-ten-years');
  assert.equal(calculateBenefitProvince(base, { ...rule, branchSourceIds: { ...rule.branchSourceIds, currentTenYears: [] } }).ok, false);
});
