import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateHousingFund, type HousingFundInput, type HousingFundRule, type HousingFundSpecialCase } from '../lib/labor-housing-fund.ts';
import type { CalculationResult } from '../lib/labor-engine.ts';

// Arithmetic fixtures mirror independently researched examples, not production policy exports.
const common = {
  sourceIds: ['fixture-current-notice', 'fixture-rounding'],
  scope: { region: '算术夹具', population: '经办核定普通缴存且无特殊情况', validFrom: '2026-07-01', validTo: '2027-06-30', verifiedOn: '2026-10-12' },
  baseStepCents: 100,
};
const beijing: HousingFundRule = {
  ...common, id: 'fixture-bj', regime: 'employee', minimumBaseCents: 254000, maximumBaseCents: 3634800,
  minimumRateBps: 500, maximumRateBps: 1200, rateStepBps: 100, calculation: 'employee-equal-share',
  precisionNote: '本版仅支持经办核定整数元基数，不能把产品精度限制冒充基数法定取整；北京比例采用经核定整数百分点。',
};
const wenzhou: HousingFundRule = {
  ...common, id: 'fixture-wz', regime: 'employee', minimumBaseCents: 243000, maximumBaseCents: 3296400,
  minimumRateBps: 500, maximumRateBps: 1200, rateStepBps: 1, calculation: 'employee-equal-share',
  precisionNote: '温州本版仅支持经办核定整数元基数、0.01个百分点精度；这是产品支持子集，不声称原文禁止其他小数精度。',
};
const flexible: HousingFundRule = { ...wenzhou, id: 'fixture-wz-flex', regime: 'flexible', minimumRateBps: 1000, maximumRateBps: 2400, calculation: 'flexible-half-rounded' };
const input: HousingFundInput = { month: '2026-10', confirmedBaseCents: 1001000, confirmedRateBps: 500, populationAndParametersConfirmed: true, specialCase: 'none' };
function amount(result: CalculationResult, id: string): number {
  assert.ok(result.ok, JSON.stringify(result)); if (!result.ok) throw new Error('unreachable');
  const row = result.lines.find((entry) => entry.id === id); assert.ok(row); return row.amountCents;
}
function total(result: CalculationResult): number { return amount(result, 'housing-fund-total'); }

test('北京逐方舍入黄金值：10010×5%=500.5，每方501，总1002', () => {
  const result = calculateHousingFund(input, beijing);
  assert.equal(amount(result, 'housing-fund-personal'), 50100);
  assert.equal(amount(result, 'housing-fund-employer'), 50100);
  assert.equal(total(result), 100200);
  assert.equal(total(calculateHousingFund({ ...input, confirmedBaseCents: 1000500 }, beijing)), 100000);
});
test('北京2026公布上限逐方8档黄金向量', () => {
  const expected = [1817, 2181, 2544, 2908, 3271, 3635, 3998, 4362];
  for (let i = 0; i < expected.length; i++) {
    const result = calculateHousingFund({ ...input, confirmedBaseCents: 3634800, confirmedRateBps: (5 + i) * 100 }, beijing);
    assert.equal(amount(result, 'housing-fund-personal'), expected[i] * 100);
    assert.equal(total(result), expected[i] * 200);
  }
});
test('温州三个分区下限和统一上限按所选规则，不跨区夹取', () => {
  for (const [base, expectedTotal] of [[266000, 26600], [243000, 24400], [218000, 21800]]) {
    const rule = { ...wenzhou, minimumBaseCents: base };
    assert.equal(total(calculateHousingFund({ ...input, confirmedBaseCents: base }, rule)), expectedTotal);
    assert.equal(calculateHousingFund({ ...input, confirmedBaseCents: base - 100 }, rule).ok, false);
  }
  assert.equal(total(calculateHousingFund({ ...input, confirmedBaseCents: 3296400, confirmedRateBps: 1200 }, wenzhou)), 791200);
});
test('温州灵活：2430×10%÷2=121.5，先取122再×2为244，不能总额直接取243', () => {
  const result = calculateHousingFund({ ...input, confirmedBaseCents: 243000, confirmedRateBps: 1000, hasOutstandingHousingFundLoan: false }, flexible);
  assert.equal(total(result), 24400);
  if (result.ok) { assert.equal(result.lines.length, 1); assert.match(result.lines[0].label, /全部由个人承担/); assert.match(result.lines[0].formula, /再 × 2/); }
  assert.equal(total(calculateHousingFund({ ...input, confirmedBaseCents: 3296400, confirmedRateBps: 2400, hasOutstandingHousingFundLoan: false }, flexible)), 791200);
});
test('温州已核定小数比例用整数bp精确计算，北京非整数百分点拒算', () => {
  assert.equal(total(calculateHousingFund({ ...input, confirmedRateBps: 501 }, wenzhou)), 100400); // 10010 × 5.01% = 501.501 each -> 502
  assert.equal(total(calculateHousingFund({ ...input, confirmedRateBps: 1001, hasOutstandingHousingFundLoan: false }, flexible)), 100200); // half = 501.0005 -> 501, total 1002
  assert.equal(calculateHousingFund({ ...input, confirmedRateBps: 501 }, beijing).ok, false);
  assert.equal(calculateHousingFund({ ...input, confirmedRateBps: 500.5 }, wenzhou).ok, false);
});
test('职工不读取无关贷款字段，灵活必须明确无未结清贷款', () => {
  const employee = { ...input };
  Object.defineProperty(employee, 'hasOutstandingHousingFundLoan', { enumerable: true, get() { throw new Error('Employee must not inspect a loan field.'); } });
  assert.equal(total(calculateHousingFund(employee, beijing)), 100200);
  for (const status of [true, undefined]) assert.equal(calculateHousingFund({ ...input, confirmedRateBps: 1000, hasOutstandingHousingFundLoan: status }, flexible).ok, false);
});
test('机关事业、降缓缴、个人减免、补退与未知不得由确认框覆盖', () => {
  const excluded: HousingFundSpecialCase[] = ['government-or-public-institution', 'reduced-or-deferred', 'personal-reduced-or-exempt', 'adjustment-or-refund', 'special-center', 'other', 'unknown'];
  for (const specialCase of excluded) assert.equal(calculateHousingFund({ ...input, specialCase }, beijing).ok, false);
  assert.equal(calculateHousingFund({ ...input, specialCase: undefined } as unknown as HousingFundInput, beijing).ok, false);
  assert.equal(calculateHousingFund({ ...input, populationAndParametersConfirmed: false }, beijing).ok, false);
});
test('已核定基数与比例不取整、不夹取；非整数分和超安全范围拒算', () => {
  for (const base of [253900, 3634900, 1001001, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(calculateHousingFund({ ...input, confirmedBaseCents: base }, beijing).ok, false);
  for (const rate of [0, 499, 1201, NaN, Infinity]) assert.equal(calculateHousingFund({ ...input, confirmedRateBps: rate }, beijing).ok, false);
});
test('规则年度边界与月中变更严格拒算，真实日历校验', () => {
  for (const month of ['2026-07', '2027-06']) assert.equal(calculateHousingFund({ ...input, month }, beijing).ok, true);
  for (const month of ['2026-06', '2027-07', '2026-00', '2026-13', '2026-10-01', '']) assert.equal(calculateHousingFund({ ...input, month }, beijing).ok, false);
  assert.equal(calculateHousingFund({ ...input, month: '2026-07' }, { ...beijing, scope: { ...beijing.scope, validFrom: '2026-07-18' } }).ok, false);
  assert.equal(calculateHousingFund(input, { ...beijing, scope: { ...beijing.scope, verifiedOn: '2026-09-31' } }).ok, false);
});
test('缺来源、缺精度说明、倒置上下限、错制度规则均拒算', () => {
  assert.equal(calculateHousingFund(input).ok, false);
  const invalid: HousingFundRule[] = [
    { ...beijing, sourceIds: [] }, { ...beijing, sourceIds: [''] }, { ...beijing, precisionNote: '' },
    { ...beijing, scope: { ...beijing.scope, region: '' } },
    { ...beijing, minimumBaseCents: 4000000 }, { ...beijing, minimumRateBps: 1300 },
    { ...beijing, baseStepCents: 0 }, { ...beijing, rateStepBps: 0 },
    { ...beijing, regime: 'flexible' }, { ...beijing, calculation: 'flexible-half-rounded' },
  ];
  for (const rule of invalid) assert.equal(calculateHousingFund(input, rule).ok, false);
});
test('每一输出保持整数分、整元、可追溯来源与范围，输入对象不被改写', () => {
  const frozenInput = Object.freeze({ ...input });
  const result = calculateHousingFund(frozenInput, beijing);
  assert.ok(result.ok);
  if (result.ok) for (const row of result.lines) {
    assert.ok(Number.isSafeInteger(row.amountCents)); assert.equal(row.amountCents % 100, 0);
    assert.deepEqual(row.sourceIds, beijing.sourceIds); assert.deepEqual(row.scope, beijing.scope); assert.ok(row.formula);
  }
  assert.equal(frozenInput.confirmedBaseCents, 1001000);
});
