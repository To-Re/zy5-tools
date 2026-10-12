import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFlexibleContributions, type FlexibleContributionInput, type FlexibleContributionRule, type EnrollmentState } from '../lib/labor-flexible-contributions.ts';
import type { CalculationResult } from '../lib/labor-engine.ts';

// Synthetic registry IDs: arithmetic is separately checked against independently researched official examples.
const rule: FlexibleContributionRule = {
  id: 'fixture-bj-designated', sourceIds: ['fixture-2026-notice', 'fixture-rates', 'fixture-same-base'],
  scope: { region: '北京', population: '通知规定渠道、普通当月已核定个人参保组合', validFrom: '2026-10-01', validTo: '2026-10-31', verifiedOn: '2026-10-12' },
  supportedChannels: ['人力资源公共服务中心个人存档', '社会保险代理机构个人存档', '街道乡镇便民服务中心'],
  minimumBaseYuan: 7270, maximumBaseYuan: 36348, pensionRateBps: 2000, unemploymentRateBps: 100, medicalFixedCents: 59368,
  itemSourceIds: { pension: ['fixture-2026-notice', 'fixture-rates', 'fixture-same-base'], unemployment: ['fixture-2026-notice', 'fixture-rates', 'fixture-same-base'], medical: ['fixture-2026-notice'] },
};
const input: FlexibleContributionInput = {
  month: '2026-10', channel: rule.supportedChannels[0], populationAndEnrollmentConfirmed: true, specialCase: 'none',
  enrollment: { pension: 'enrolled', unemployment: 'enrolled', medical: 'enrolled' }, confirmedBaseYuan: 7270,
};
function amount(result: CalculationResult, id: string): number {
  assert.ok(result.ok, JSON.stringify(result)); if (!result.ok) throw new Error('unreachable');
  const row = result.lines.find((entry) => entry.id === id); assert.ok(row); return row.amountCents;
}

test('独立下限金值：1454+72.70+593.68=2120.38', () => {
  const result = calculateFlexibleContributions(input, rule);
  assert.equal(amount(result, 'flexible-pension'), 145400);
  assert.equal(amount(result, 'flexible-unemployment'), 7270);
  assert.equal(amount(result, 'flexible-medical'), 59368);
  assert.equal(amount(result, 'flexible-selected-total'), 212038);
});
test('上限与奇数整数元金值精确到分，无地方舍入猜测', () => {
  const upper = calculateFlexibleContributions({ ...input, confirmedBaseYuan: 36348 }, rule);
  assert.equal(amount(upper, 'flexible-pension'), 726960);
  assert.equal(amount(upper, 'flexible-unemployment'), 36348);
  assert.equal(amount(upper, 'flexible-selected-total'), 822676);
  const odd = calculateFlexibleContributions({ ...input, confirmedBaseYuan: 10001 }, rule);
  assert.equal(amount(odd, 'flexible-pension'), 200020);
  assert.equal(amount(odd, 'flexible-unemployment'), 10001);
  assert.equal(amount(odd, 'flexible-selected-total'), 269389);
});
test('只医保不读取无关输入基数或基数规则，输出593.68', () => {
  const medicalOnly: FlexibleContributionInput = { ...input, enrollment: { pension: 'not-enrolled', unemployment: 'not-enrolled', medical: 'enrolled' } };
  Object.defineProperty(medicalOnly, 'confirmedBaseYuan', { enumerable: true, get() { throw new Error('Medical-only must not read base.'); } });
  const medicalRule = { ...rule };
  for (const field of ['minimumBaseYuan', 'maximumBaseYuan', 'pensionRateBps', 'unemploymentRateBps']) Object.defineProperty(medicalRule, field, { get() { throw new Error('Medical-only must not read unselected formula.'); } });
  const result = calculateFlexibleContributions(medicalOnly, medicalRule);
  assert.equal(amount(result, 'flexible-medical'), 59368);
  assert.equal(amount(result, 'flexible-selected-total'), 59368);
  if (result.ok) { assert.equal(result.lines.length, 2); assert.deepEqual(result.lines[1].sourceIds, rule.itemSourceIds.medical); }
});
test('已核定未参加项目不造零行，两个比例项共用一个核定基数', () => {
  const pair = calculateFlexibleContributions({ ...input, enrollment: { pension: 'enrolled', unemployment: 'enrolled', medical: 'not-enrolled' } }, rule);
  assert.equal(amount(pair, 'flexible-selected-total'), 152670);
  if (pair.ok) assert.deepEqual(pair.lines.map((row) => row.id), ['flexible-pension', 'flexible-unemployment', 'flexible-selected-total']);
  const pensionOnly = calculateFlexibleContributions({ ...input, enrollment: { pension: 'enrolled', unemployment: 'not-enrolled', medical: 'not-enrolled' } }, rule);
  assert.equal(amount(pensionOnly, 'flexible-selected-total'), 145400);
  assert.equal(calculateFlexibleContributions({ ...input, confirmedBaseYuan: undefined }, rule).ok, false);
});
test('任何未知/缺失参保状态均拒算，全未参加也不输出零元权益', () => {
  for (const insurance of ['pension', 'unemployment', 'medical'] as const) {
    for (const status of ['unknown', undefined, 'false'] as unknown as EnrollmentState[]) {
      assert.equal(calculateFlexibleContributions({ ...input, enrollment: { ...input.enrollment, [insurance]: status } }, rule).ok, false);
    }
  }
  assert.equal(calculateFlexibleContributions({ ...input, enrollment: { pension: 'not-enrolled', unemployment: 'not-enrolled', medical: 'not-enrolled' } }, rule).ok, false);
});
test('未知/非规定渠道、人群未确认、补缴减免及特殊状态拒算', () => {
  for (const channel of ['', 'unknown', '全部自由职业者', '城乡居民']) assert.equal(calculateFlexibleContributions({ ...input, channel }, rule).ok, false);
  assert.equal(calculateFlexibleContributions({ ...input, populationAndEnrollmentConfirmed: false }, rule).ok, false);
  for (const specialCase of ['backpayment-or-adjustment', 'subsidy-or-exemption', 'other', 'unknown'] as const) assert.equal(calculateFlexibleContributions({ ...input, specialCase }, rule).ok, false);
});
test('分期只覆盖核验完整2026-10，不推定7月起一直续期', () => {
  for (const month of ['2026-07', '2026-09', '2026-11', '2027-01', '2026-13', '2026-10-01', '']) assert.equal(calculateFlexibleContributions({ ...input, month }, rule).ok, false);
  assert.equal(calculateFlexibleContributions(input, { ...rule, scope: { ...rule.scope, validFrom: '2026-10-02' } }).ok, false);
  assert.equal(calculateFlexibleContributions(input, { ...rule, scope: { ...rule.scope, verifiedOn: '2026-09-31' } }).ok, false);
});
test('核定基数越界/小数/非数/溢出拒绝，不补零或夹限', () => {
  for (const confirmedBaseYuan of [0, 7269, 36349, 7270.01, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(calculateFlexibleContributions({ ...input, confirmedBaseYuan }, rule).ok, false);
});
test('缺规则、所选来源缺失、非法基数区间或分以下结果拒算', () => {
  assert.equal(calculateFlexibleContributions(input).ok, false);
  const invalid: FlexibleContributionRule[] = [
    { ...rule, sourceIds: [] }, { ...rule, supportedChannels: [] }, { ...rule, minimumBaseYuan: 40000 },
    { ...rule, itemSourceIds: { ...rule.itemSourceIds, pension: [] } },
    { ...rule, itemSourceIds: { ...rule.itemSourceIds, medical: ['unverified-id'] } },
    { ...rule, medicalFixedCents: 59368.1 },
  ];
  for (const badRule of invalid) assert.equal(calculateFlexibleContributions(input, badRule).ok, false);
  const fraction = calculateFlexibleContributions({ ...input, confirmedBaseYuan: 10001 }, { ...rule, pensionRateBps: 1 });
  assert.equal(fraction.ok, false); if (!fraction.ok) assert.match(fraction.errors.join(), /分以下尾差/);
});
test('所有现金输出带来源、公式和适用范围，不改原始输入', () => {
  const frozen = Object.freeze({ ...input });
  const result = calculateFlexibleContributions(frozen, rule);
  assert.ok(result.ok);
  if (result.ok) for (const row of result.lines) {
    assert.ok(Number.isSafeInteger(row.amountCents)); assert.ok(row.sourceIds.length); assert.ok(row.formula); assert.deepEqual(row.scope, rule.scope);
    assert.ok(row.sourceIds.every((id) => rule.sourceIds.includes(id)));
  }
  assert.equal(frozen.confirmedBaseYuan, 7270);
});
