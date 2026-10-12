import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePensionPlan, solvePensionPlanTarget, type PensionPlannerInput } from '../lib/labor-pension-planner.ts';
import { LABOR_PENSION_PLANNER_RULES as rules, LABOR_SOURCES } from '../lib/labor-rules.ts';

function plan(): PensionPlannerInput {
  return {
    personal: { birthMonth: '1980-01', category: 'original-60', householdProvince: '上海', relationshipProvince: '上海', accountKind: 'ordinary', specialCase: 'none' },
    snapshotMonth: '2026-10', historicalRecordsConfirmed: true, frozen2026Confirmed: true,
    history: [{ id: 'h', from: '2014-02', to: '2026-09', province: '上海', regime: 'employee', recognizedMonths: 152, indexSum4: 1520000 }],
    future: [{ id: 'f', from: '2026-10', to: '2043-01', province: '上海', regime: 'employee', baseCents: 1257700 }],
    account: { balanceCents: 10000000, asOfMonth: '2026-09' }, payoutYears: 20, unlistedFutureMonths: 'paused',
  };
}
const run = (p = plan()) => calculatePensionPlan(p, rules);
function amount(result: ReturnType<typeof run>, id: string) { const row = result.lines.find(r => r.id === id); assert.ok(row, id); return row.amountCents; }
const inverse = (p = plan(), target = 600000) => solvePensionPlanTarget({ plan: p, variable: 'base', targetMonthlyCents: target, futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee', maximumPersonalMonthlyCents: 1000000 }, rules);

test('独立生产规划：29年、63岁117月，分项独立进角与未来入账手算', () => {
  const r = run(); assert.equal(r.status, 'supported', r.issues.join(';'));
  assert.equal(r.retirement!.chosenRetirementMonth, '2043-01'); assert.equal(r.retirement!.minimumContributionMonths, 240);
  assert.equal(r.totalMonths, 348); assert.equal(r.historicalMonths, 152); assert.equal(r.futureMonths, 196);
  assert.equal(amount(r, 'planner-future-account'), 19720736); assert.equal(amount(r, 'planner-retirement-account'), 29720736);
  assert.equal(amount(r, 'planner-future-personal-paid'), 19720736); assert.equal(amount(r, 'planner-future-employer-paid'), 39441472);
  // S=12577, I=1, Y=29 =>3647.33→3647.40; A/117=2540.2338…→2540.30.
  assert.equal(amount(r, 'planner-pension-basic'), 364740); assert.equal(amount(r, 'planner-pension-account'), 254030);
  assert.equal(amount(r, 'planner-pension-monthly'), 618770); assert.equal(amount(r, 'planner-payout-window'), 148504800);
});

test('独立现金轴：历史未知保持null、未来个人/单位/账户分开、窗口非除数', () => {
  const r = run(); const historical = r.points.find(p => p.month === '2026-09')!;
  assert.equal(historical.personalCents, null); assert.equal(historical.personalCumulativeComplete, false);
  const future = r.points.find(p => p.month === '2043-01')!;
  assert.equal(future.cumulativePersonalCents, 19720736); assert.equal(future.cumulativeEmployerCents, 39441472);
  assert.equal(future.pensionCents, 0); assert.equal(r.points.find(p => p.month === '2043-02')!.pensionCents, 618770);
  assert.equal(r.points.filter(p => p.phase === 'payout').length, 240);
  const p = plan(); p.payoutYears = 1; const one = run(p);
  assert.equal(amount(one, 'planner-pension-monthly'), 618770); assert.equal(one.points.filter(p => p.phase === 'payout').length, 12);
});

test('独立灵活现金：20%个人支出不可全部记入8%账户', () => {
  const p = plan(); p.future[0].regime = 'flexible';
  assert.equal(run(p).status, 'unsupported');
  p.flexibleEligibilityConfirmed = true; const r = run(p);
  assert.equal(r.status, 'supported', r.issues.join(';'));
  const end = r.points.find(p => p.month === '2043-01')!;
  assert.equal(end.cumulativePersonalCents, 49301840); assert.equal(end.cumulativeEmployerCents, 0);
  assert.equal(amount(r, 'planner-future-personal-paid'), 49301840); assert.equal(amount(r, 'planner-future-employer-paid'), 0);
  assert.equal(amount(r, 'planner-future-account'), 19720736); assert.equal(amount(r, 'planner-pension-monthly'), 618770);
});

test('独立资料门禁：未知账户/指数/确认/账户性质绝不以0代入', () => {
  for (const edit of [
    (p: PensionPlannerInput) => { delete p.account; }, (p: PensionPlannerInput) => { p.account!.asOfMonth = '2026-08'; },
    (p: PensionPlannerInput) => { delete p.history[0].indexSum4; }, (p: PensionPlannerInput) => { delete p.history[0].recognizedMonths; },
    (p: PensionPlannerInput) => { p.historicalRecordsConfirmed = false; }, (p: PensionPlannerInput) => { p.frozen2026Confirmed = false; },
    (p: PensionPlannerInput) => { p.personal.accountKind = 'temporary'; }, (p: PensionPlannerInput) => { p.personal.specialCase = 'unknown'; },
  ]) { const p = plan(); edit(p); const r = run(p); assert.equal(r.status, 'unsupported'); assert.equal(r.lines.length, 0); }
});

test('独立日历门禁：重叠/过去未来交叠/非整岁拒金额，非季度月可经包络证明', () => {
  for (const edit of [
    (p: PensionPlannerInput) => { p.history.push({ ...p.history[0], id: 'duplicate' }); },
    (p: PensionPlannerInput) => { p.future[0].from = '2026-09'; },
    (p: PensionPlannerInput) => { p.future[0].to = '2043-02'; },
    (p: PensionPlannerInput) => { p.future[0].baseCents = 1000000; },
  ]) { const p = plan(); edit(p); assert.equal(run(p).status, 'unsupported'); }
  const nonQuarter = plan(); nonQuarter.future[0].to = '2042-12'; assert.equal(run(nonQuarter).status, 'supported');
  const fractional = plan(); fractional.personal.birthMonth = '1971-09'; fractional.future[0].to = '2033-06';
  assert.equal(run(fractional).retirement!.chosenAgeMonths, 741); assert.equal(run(fractional).status, 'unsupported');
});

test('独立领取省：未来跨省/城市名/临时账户不自动拼待遇，省关系仍按先后', () => {
  const cross = plan(); cross.future[0].province = '浙江'; assert.equal(run(cross).status, 'unsupported');
  const city = plan(); city.personal.householdProvince = '温州'; assert.equal(run(city).benefitProvince, undefined);
  const p = plan(); p.personal.householdProvince = '浙江';
  assert.equal(run(p).benefitProvince!.province, '上海');
  const r = run(p); assert.equal(r.benefitProvince!.conditional, true); assert.match(r.benefitProvince!.explanation, /冻结|条件|保持/);
});

test('独立缺失未来段不等停缴：显式停缴为0，unknown阻断金额', () => {
  const p = plan(); p.future[0].from = '2027-01'; p.unlistedFutureMonths = 'unknown';
  const unknown = run(p); assert.equal(unknown.status, 'unsupported');
  assert.equal(unknown.points.find(p => p.month === '2026-10')!.personalCents, null);
  p.unlistedFutureMonths = 'paused'; const paused = run(p); assert.equal(paused.status, 'supported');
  assert.equal(paused.points.find(p => p.month === '2026-10')!.personalCents, 0);
});

test('独立领取省119/120边界：未知未来不得假定各省未满十年', () => {
  const p = plan(); p.personal.householdProvince = '北京';
  p.history = [{ ...p.history[0], from: '2020-01', recognizedMonths: 81, indexSum4: 810000 }];
  p.future[0].to = '2026-10'; p.unlistedFutureMonths = 'unknown';
  const unknown = run(p); assert.equal(unknown.qualification, 'unknown'); assert.equal(unknown.benefitProvince, undefined);
  p.unlistedFutureMonths = 'paused'; p.future[0].to = '2029-11';
  assert.equal(run(p).benefitProvince!.province, '北京');
  p.future[0].to = '2029-12'; assert.equal(run(p).benefitProvince!.province, '上海');
});

test('独立历史空档与年龄：缺月不能算停缴，普通域未满16岁不认权益', () => {
  const p = plan(); p.history[0].to = '2026-08'; p.history[0].recognizedMonths = 151; p.history[0].indexSum4 = 1510000;
  assert.equal(run(p).qualification, 'unknown'); assert.equal(run(p).status, 'unsupported');
  const child = plan(); child.personal.birthMonth = '2008-04'; child.future[0].to = '2071-04';
  assert.equal(run(child).status, 'unsupported'); assert.match(run(child).issues.join(';'), /16|年龄/);
});

test('独立省份顺序：最后满十年而非最长；户籍关系优先且不足十年也成立', () => {
  const p = plan(); p.personal.householdProvince = '广东'; p.personal.relationshipProvince = '北京'; p.future = [];
  p.history = [
    { id: 'sh', from: '1996-01', to: '2006-12', province: '上海', regime: 'employee', recognizedMonths: 132 },
    { id: 'zj', from: '2007-01', to: '2016-12', province: '浙江', regime: 'employee', recognizedMonths: 120 },
    { id: 'bj', from: '2017-01', to: '2026-09', province: '北京', regime: 'employee', recognizedMonths: 117 },
  ];
  const latest = run(p); assert.equal(latest.status, 'unsupported'); assert.equal(latest.benefitProvince!.province, '浙江');
  p.personal.householdProvince = '北京'; assert.equal(run(p).benefitProvince!.province, '北京');
  p.personal.householdProvince = '广东';
  p.history = [
    { id: 'sh', from: '2000-01', to: '2009-11', province: '上海', regime: 'employee', recognizedMonths: 119 },
    { id: 'zj', from: '2009-12', to: '2019-10', province: '浙江', regime: 'employee', recognizedMonths: 119 },
    { id: 'bj', from: '2019-11', to: '2026-09', province: '北京', regime: 'employee', recognizedMonths: 83 },
  ];
  assert.equal(run(p).benefitProvince!.province, '广东');
});

test('独立逆算：真实整数元域已确定门槛，每个精确候选正算一致且历史及账户不变', () => {
  const p = plan(), before = structuredClone(p); const r = inverse(p, 618770);
  assert.equal(r.status, 'multiple'); assert.ok(r.candidates.length >= 1); assert.equal(r.rangeSearch!.lowerBoundMinimumBaseCents, 1257700); assert.deepEqual(p, before);
  for (const c of r.candidates) {
    const forward = run({ ...p, future: c.future }); assert.equal(forward.status, 'supported');
    assert.equal(amount(forward, 'planner-pension-monthly'), c.monthlyPensionCents); assert.ok(c.monthlyPensionCents >= 600000);
    assert.equal(c.personalTotalCents, c.personalMonthlyCents * c.months);
  }
  assert.deepEqual(inverse(p, 618770), r); assert.deepEqual(p, before);
});

test('独立逆算无解只在已知域，未知历史与金额资料必须unsupported', () => {
  assert.equal(inverse(plan(), 100000000).status, 'infeasible');
  const missing = plan(); delete missing.history[0].indexSum4; assert.equal(inverse(missing).status, 'unsupported');
  // Also insufficient months: missing evidence must not be overwritten by ineligible and then treated as no solution.
  const short = plan(); short.history = [{ ...short.history[0], from: '2026-08', recognizedMonths: 2, indexSum4: undefined }];
  assert.equal(inverse(short).status, 'unsupported');
});

test('独立求时长：目标2000仍须补到240月，88月方案不得提前退休', () => {
  const p = plan();
  const request = { plan: p, variable: 'months' as const, fixedBaseCents: 1257700, targetMonthlyCents: 200000, futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee' as const, maximumPersonalMonthlyCents: 100616 };
  const solved = solvePensionPlanTarget(request, rules); assert.equal(solved.status, 'multiple');
  const first = solved.candidates[0]; assert.equal(first.months, 88); assert.equal(first.to, '2034-01');
  assert.equal(first.personalTotalCents, 8854208); assert.equal(first.monthlyPensionCents, 412690);
  const forward = run({ ...p, future: first.future, unlistedFutureMonths: 'paused' });
  assert.equal(forward.retirement!.chosenRetirementMonth, '2043-01'); assert.equal(forward.totalMonths, 240);
  assert.equal(solvePensionPlanTarget({ ...request, maximumPersonalMonthlyCents: 100615 }, rules).status, 'infeasible');
});

test('独立生产来源：公式/账户/指数/首领单独来源，所有行及候选可追溯', () => {
  const rule = rules.projection!;
  for (const e of [rule, rule.formulaEvidence, rule.accountEvidence, rule.indexEvidence, rule.contributionEvidence, rule.payoutEvidence]) {
    assert.ok(e.sourceIds.length); assert.equal(e.scope.verifiedOn, '2026-10-12');
    for (const id of e.sourceIds) { assert.ok(rule.sourceIds.includes(id)); assert.ok(LABOR_SOURCES[id], id); assert.match(LABOR_SOURCES[id].url, /^https:\/\//); }
  }
  assert.equal(LABOR_SOURCES['sh-pension-2026'].effectiveTo, '2031-08-15');
  for (const row of [...run().lines, ...inverse().candidates.flatMap(c => c.lines)]) {
    assert.ok(row.formula); assert.ok(row.scope.population); assert.ok(row.sourceIds.length);
    for (const id of row.sourceIds) assert.ok(LABOR_SOURCES[id], id);
  }
  const broken = structuredClone(rules); broken.projection!.accountEvidence.sourceIds = [];
  assert.equal(calculatePensionPlan(plan(), broken).status, 'unsupported');
});

test('独立退休当月新证据：员工正常缴费须专门来源，缺失只阻覆盖该月的金额', () => {
  const p = plan(); const r = run(p); assert.equal(r.status, 'supported'); assert.equal(amount(r, 'planner-pension-monthly'), 618770);
  assert.ok(r.lines.every(row => row.sourceIds.includes('sh-retirement-month-payment')));
  assert.equal(LABOR_SOURCES['sh-retirement-month-payment'].publishedAt, '2026-09-11');
  const missing = structuredClone(rules); delete missing.projection!.employeeRetirementMonthEvidence;
  assert.equal(calculatePensionPlan(p, missing).status, 'unsupported');
  p.future[0].to = '2042-10'; // 193 future months +152 =345, no retirement-month payment.
  assert.equal(calculatePensionPlan(p, missing).status, 'supported');
  const stale = structuredClone(rules); stale.projection!.employeeRetirementMonthEvidence!.scope.validTo = '2026-09-30';
  assert.equal(calculatePensionPlan(plan(), stale).status, 'unsupported');
});

test('独立灵活退休当月：前月不足门槛不借问答补满，前月已满才可选当月', () => {
  const p = plan(); p.flexibleEligibilityConfirmed = true; p.future[0].regime = 'flexible';
  p.future[0].from = '2035-10'; // 88 future months: total240, but before retirement month only239.
  const insufficientBefore = run(p); assert.equal(insufficientBefore.status, 'unsupported'); assert.match(insufficientBefore.issues.join(';'), /前月/);
  p.future[0].from = '2035-07'; // 91 future months: before retirement month242, total243 exact years.
  assert.equal(run(p).status, 'supported');
  const missing = structuredClone(rules); delete missing.projection!.flexibleRetirementMonthEvidence;
  assert.equal(calculatePensionPlan(p, missing).status, 'unsupported');
});

test('独立最高可达诊断：目标20000受预算和整数元域约束，未知不能伪造最高值', () => {
  const p = plan();
  const request = { plan: p, variable: 'base' as const, targetMonthlyCents: 2000000, futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee' as const, maximumPersonalMonthlyCents: 301848 };
  const max3 = solvePensionPlanTarget(request, rules); assert.equal(max3.status, 'infeasible');
  // 3×: basic5701.5733…→5701.60, account691622.08/117→5911.30.
  assert.equal(max3.rangeSearch!.maximumMonthlyMinimumCents, 1161290); assert.equal(max3.rangeSearch!.maximumMonthlyMaximumCents, 1161290);
  assert.equal(max3.rangeSearch!.maximumWithinBudgetBaseCents, 3773100);
  assert.ok(max3.rangeSearch!.sourceIds.includes('sh-retirement-month-payment'));
  assert.ok(max3.constraints!.some(c => c.includes('整数元')));
  const max2 = solvePensionPlanTarget({ ...request, maximumPersonalMonthlyCents: 201232 }, rules);
  assert.equal(max2.rangeSearch!.maximumMonthlyMinimumCents, 890030); assert.equal(max2.rangeSearch!.maximumMonthlyMaximumCents, 890030); assert.equal(max2.rangeSearch!.maximumWithinBudgetBaseCents, 2515400);
  const noBudget = solvePensionPlanTarget({ ...request, maximumPersonalMonthlyCents: 60367 }, rules);
  assert.equal(noBudget.status, 'infeasible'); assert.equal(noBudget.attainableMaximumMonthlyCents, undefined); assert.equal(noBudget.bestCandidate, undefined);
  delete p.history[0].indexSum4;
  const unknown = solvePensionPlanTarget(request, rules); assert.equal(unknown.status, 'unsupported');
  assert.equal(unknown.attainableMaximumMonthlyCents, undefined); assert.equal(unknown.bestCandidate, undefined); assert.deepEqual(unknown.candidates, []);
});
