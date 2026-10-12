import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePensionPlan, solvePensionPlanTarget, type PensionPlannerInput } from '../lib/labor-pension-planner.ts';
import { LABOR_PENSION_PLANNER_RULES, LABOR_SOURCES } from '../lib/labor-rules.ts';
import { LABOR_AUTO_CONTRIBUTION_RULES, LABOR_FROZEN_SALARY_RULES, LABOR_PENSION_COMPONENT_RULES } from '../lib/labor-rules.ts';
import { calculateAutoContributionScenario } from '../lib/labor-auto-scenario.ts';
import { calculateFrozenSalaryComparison, type FrozenSalaryComparisonInput } from '../lib/labor-frozen-salary.ts';
import { calculateBasicPensionComponent, calculateAccountPensionComponent, type BasicPensionComponentInput } from '../lib/labor-pension-components.ts';

// Production registry must itself admit the expanded domain; clones only isolate individual tests.
function rules() {
  const r = structuredClone(LABOR_PENSION_PLANNER_RULES);
  assert.equal(r.projection!.futureBaseDomain, 'whole-yuan-range'); assert.equal(r.projection!.earliestHistoryMonth, '1993-01');
  return r;
}
function plan(): PensionPlannerInput {
  return {
    personal: { birthMonth: '1980-01', category: 'original-60', householdProvince: '上海', relationshipProvince: '上海', accountKind: 'ordinary', specialCase: 'none' },
    snapshotMonth: '2026-10', historicalRecordsConfirmed: true, frozen2026Confirmed: true,
    history: [{ id: 'h', from: '2014-02', to: '2026-09', province: '上海', regime: 'employee', recognizedMonths: 152, indexSum4: 1520000 }],
    future: [{ id: 'f', from: '2026-10', to: '2043-01', province: '上海', regime: 'employee', baseCents: 1257700 }],
    account: { balanceCents: 10000000, asOfMonth: '2026-09' }, payoutYears: 20, unlistedFutureMonths: 'paused',
  };
}
const run = (p = plan()) => calculatePensionPlan(p, rules());
const request = (target: number, budget = 1000000) => ({ plan: plan(), variable: 'base' as const, targetMonthlyCents: target, futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee' as const, maximumPersonalMonthlyCents: budget });

test('扩域独审：非季度年限上下端相同可精确，不能取消规定四位年限', () => {
  const p = plan(); p.history[0].from = '2014-01'; p.history[0].recognizedMonths = 153; p.history[0].indexSum4 = 1530000;
  const r = run(p); assert.equal(r.status, 'supported', r.issues.join(';')); assert.equal(r.totalMonths, 349);
  assert.equal(r.roundingDiagnostic!.basicMinimumCents, 365790); assert.equal(r.roundingDiagnostic!.basicMaximumCents, 365790);
  assert.equal(r.lines.find(l => l.id === 'planner-pension-monthly')!.amountCents, 619820);
  p.history[0].indexSum4 = 1440086; // Total Q=3400086, independent Fraction calculation gives distinct tenth-yuan endpoints.
  const uncertain = run(p); assert.equal(uncertain.status, 'unsupported');
  assert.equal(uncertain.roundingDiagnostic!.basicMinimumCents, 361070); assert.equal(uncertain.roundingDiagnostic!.basicMaximumCents, 361080);
  assert.ok(!uncertain.lines.some(l => l.id === 'planner-pension-monthly'));
  assert.ok(uncertain.points.filter(point => point.phase === 'payout').every(point => point.pensionCents === null));
});

test('扩域独审：任意整元基数双包络和账户现金独立金值', () => {
  for (const [base, basicLow, basicHigh, monthlyLow, monthlyHigh] of [
    [1000000, 343690, 343700, 563180, 563190], [754600, 323640, 323650, 510240, 510250], [3773100, 570160, 570160, 1161290, 1161290],
  ]) {
    const p = plan(); p.future[0].baseCents = base; const r = run(p), d = r.roundingDiagnostic!;
    assert.ok(d, r.issues.join(';')); assert.equal(d.basicMinimumCents, basicLow); assert.equal(d.basicMaximumCents, basicHigh);
    assert.equal(d.monthlyMinimumCents, monthlyLow); assert.equal(d.monthlyMaximumCents, monthlyHigh);
    assert.equal(r.points.find(point => point.month === '2026-10')!.personalCents, base * 8 / 100);
    assert.equal(r.points.find(point => point.month === '2026-10')!.employerCents, base * 16 / 100);
    assert.equal(r.status, monthlyLow === monthlyHigh ? 'supported' : 'unsupported');
    assert.ok(d.sourceIds.length); for (const id of d.sourceIds) assert.ok(LABOR_SOURCES[id]);
  }
  for (const base of [754599, 754500, 3773101, 3773200, 1000001, -1]) { const p = plan(); p.future[0].baseCents = base; assert.equal(run(p).roundingDiagnostic, undefined); }
});

test('扩域独审：更早核定历史必含保底且不可掩盖缺失资料', () => {
  const p = plan(); p.personal.birthMonth = '1977-01'; p.future[0].to = '2040-01';
  p.history = [{ ...p.history[0], from: '1993-01', recognizedMonths: 405, indexSum4: 4050000 }];
  assert.equal(run(p).roundingDiagnostic, undefined);
  p.historyIndexTreatment = 'agency-2026-adjusted'; assert.ok(run(p).roundingDiagnostic);
  // Jan 1993–Dec 2011:228*1; 2012:12*.85; 2013:12*.75 =>247.2, later months nonnegative.
  p.history[0].indexSum4 = 2471999; assert.equal(run(p).roundingDiagnostic, undefined);
  p.history[0].indexSum4 = 4050000; delete p.account;
  assert.equal(run(p).roundingDiagnostic, undefined); assert.equal(run(p).status, 'unsupported');
});

// Independent exhaustive arithmetic oracle: all 30186 integer-yuan bases, no production forward/inverse calls.
function oracleRange(baseYuan: number): [number, number] {
  const j = BigInt(baseYuan) * BigInt(10000), denom = BigInt(12577);
  const indices = [j / denom, (j + denom - BigInt(1)) / denom];
  const ceilTenth = (n: bigint, d: bigint) => Number((n + BigInt(10) * d - BigInt(1)) / (BigInt(10) * d) * BigInt(10));
  const account = ceilTenth(BigInt(10000000) + BigInt(baseYuan) * BigInt(8) * BigInt(196), BigInt(117));
  // For this oracle fixture M=348 is exactly29 years, isolating the per-month index uncertainty.
  return indices.map(i => account + ceilTenth(BigInt(1257700) * (BigInt(3480000) + BigInt(1520000) + BigInt(196) * i) * BigInt(29), BigInt(2) * BigInt(3480000) * BigInt(100))) as [number, number];
}

test('扩域独审：双二分门槛与全整数域独立遍历一致，不把区间上界当确定达标', () => {
  for (const target of [200000, 510245, 563185, 600000, 1000000, 1161290, 1161291]) {
    let possible: number | undefined, definite: number | undefined;
    for (let b = 7546; b <= 37731; b++) { const [lo, hi] = oracleRange(b); if (possible === undefined && hi >= target) possible = b * 100; if (definite === undefined && lo >= target) definite = b * 100; }
    const input = request(target), copy = structuredClone(input), result = solvePensionPlanTarget(input, rules());
    assert.deepEqual(input, copy); assert.ok(result.evaluatedCandidates <= 36, String(result.evaluatedCandidates));
    assert.equal(result.rangeSearch!.possibleMinimumBaseCents, possible, `possible ${target}`);
    assert.equal(result.rangeSearch!.lowerBoundMinimumBaseCents, definite, `definite ${target}`);
    assert.equal(result.status === 'infeasible', possible === undefined);
    if (possible !== definite) { assert.equal(result.minimumStatus, 'uncertain'); assert.ok(['feasible', 'unsupported'].includes(result.status)); }
    for (const c of result.candidates) {
      const forward = run({ ...input.plan, future: c.future, unlistedFutureMonths: 'paused' }); assert.equal(forward.status, 'supported');
      assert.ok(c.monthlyPensionCents >= target); assert.equal(c.monthlyPensionCents, forward.roundingDiagnostic!.monthlyMinimumCents);
    }
  }
});

test('扩域独审：更短区间不掩盖94月确定解，后续区间不抹掉88月已证最短', () => {
  const input = { plan: plan(), variable: 'months' as const, fixedBaseCents: 1257700, targetMonthlyCents: 422235, futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee' as const, maximumPersonalMonthlyCents: 100616 };
  const uncertain = solvePensionPlanTarget(input, rules());
  assert.equal(uncertain.status, 'feasible'); assert.equal(uncertain.minimumStatus, 'uncertain');
  assert.equal(uncertain.candidates[0].months, 94); assert.equal(uncertain.candidates[0].monthlyPensionCents, 424140);
  const sensitive = uncertain.sensitiveCandidates!.find(c => c.months === 93)!;
  assert.equal(sensitive.minimumMonthlyCents, 422230); assert.equal(sensitive.maximumMonthlyCents, 422240); assert.equal(sensitive.targetRelation, 'overlaps');
  const low = solvePensionPlanTarget({ ...input, targetMonthlyCents: 200000 }, rules());
  assert.equal(low.status, 'multiple'); assert.equal(low.minimumStatus, 'exact-candidate'); assert.equal(low.candidates[0].months, 88);
  assert.equal(low.candidates[0].monthlyPensionCents, 412690);
});

const salaryInput: FrozenSalaryComparisonInput = { city: 'shanghai', month: '2026-10', grossCents: 1000000, priorAverageWageCents: 1000000, housingRateBps: 500, assumptions: 'ordinary-employee-no-special-cases', frozenComparisonConfirmed: true };
const salaryRule = () => LABOR_FROZEN_SALARY_RULES.find(r => r.city === 'shanghai')!;
const salary = (patch: Partial<FrozenSalaryComparisonInput> = {}) => calculateFrozenSalaryComparison({ ...salaryInput, ...patch }, LABOR_AUTO_CONTRIBUTION_RULES, salaryRule());

test('扩域独审上海真规则：低端法定floor、高端跨税档和当前工资分独立黄金', () => {
  for (const [gross, prior, paid, tax, annualNet] of [
    [500000, 500000, 104233, 0, 4749204],
    [2000000, 2000000, 310000, 1176000, 19104000],
    [1000001, 1000000, 155000, 162001, 9978011],
  ]) {
    const r = salary({ grossCents: gross, priorAverageWageCents: prior }); assert.ok(r.ok, JSON.stringify(r));
    const value = (id: string) => r.lines.find(l => l.id === id)!.amountCents;
    assert.equal(value('comparison-monthly-paid'), paid); assert.equal(value('comparison-annual-tax'), tax); assert.equal(value('comparison-annual-net'), annualNet);
    assert.ok(r.lines.every(l => l.formula && l.sourceIds.length && l.sourceIds.every(id => LABOR_SOURCES[id])));
  }
});

test('扩域独审上海：现金不足不是负到账，0输入仍按法定下限算缴费', () => {
  for (const [gross, prior, expectedGap] of [[0, 0, 92933], [154999, 1000000, 1]]) {
    const input = { ...salaryInput, grossCents: gross, priorAverageWageCents: prior };
    const r = calculateAutoContributionScenario(input, LABOR_AUTO_CONTRIBUTION_RULES);
    assert.equal(r.personal.status, 'complete'); assert.equal(r.personal.lines.find(l => l.id === 'personal-cash-shortfall')!.amountCents, expectedGap);
    assert.ok(!r.personal.lines.some(l => l.id === 'before-tax')); assert.equal(salary(input).ok, false);
  }
  assert.ok(salary({ grossCents: 155000 }).ok);
});

test('扩域独审上海：税限有理数比较只判超限，不引入限额舍入', () => {
  // This artificial cap audits arithmetic only; it does not change the production statutory cap.
  const above = structuredClone(salaryRule()); above.housingTax.maximumBaseCents = 416667; // cap=50000.04fen, paid50000fen allowed.
  assert.ok(calculateFrozenSalaryComparison(salaryInput, LABOR_AUTO_CONTRIBUTION_RULES, above).ok);
  above.housingTax.maximumBaseCents = 416666; // cap=49999.92fen: rounding it up would incorrectly admit paid50000.
  assert.equal(calculateFrozenSalaryComparison(salaryInput, LABOR_AUTO_CONTRIBUTION_RULES, above).ok, false);
});

test('扩域独审上海：各项目自身尾差仍拦截，不能把上限自动取整', () => {
  assert.ok(salary({ priorAverageWageCents: 1002000 }).ok);
  assert.ok(salary({ priorAverageWageCents: 1005000, housingRateBps: 600 }).ok);
  assert.equal(salary({ priorAverageWageCents: 1002000, housingRateBps: 600 }).ok, false);
  const capped = calculateAutoContributionScenario({ ...salaryInput, grossCents: 4000000, priorAverageWageCents: 4000000 }, LABOR_AUTO_CONTRIBUTION_RULES);
  assert.equal(capped.personal.status, 'partial'); assert.ok(capped.personal.missing.some(m => m.itemId === 'unemployment')); assert.ok(capped.personal.missing.some(m => m.itemId === 'housing'));
  assert.equal(capped.personal.lines.find(l => l.id === 'personal-pension')!.amountCents, 301848);
  for (const patch of [{ grossCents: -1 }, { priorAverageWageCents: -1 }, { priorAverageWageCents: 1000001 }, { grossCents: NaN }, { socialBaseCents: 1000000 }, { housingRateBps: 550 }]) assert.equal(salary(patch).ok, false);
});

test('扩域独审：预算按分约束、短缴不是提高基数可解、未知资料不当无解', () => {
  const below = solvePensionPlanTarget(request(200000, 60367), rules()); assert.equal(below.status, 'infeasible');
  const exact = solvePensionPlanTarget(request(200000, 60368), rules()); assert.equal(exact.rangeSearch!.maximumWithinBudgetBaseCents, 754600);
  const short = request(200000); short.futureTo = '2027-01'; assert.equal(solvePensionPlanTarget(short, rules()).status, 'infeasible');
  delete short.plan.history[0].indexSum4; assert.equal(solvePensionPlanTarget(short, rules()).status, 'unsupported');
  const missing = request(200000, 0); delete missing.plan.account;
  assert.equal(solvePensionPlanTarget(missing, rules()).status, 'unsupported');
});

const componentInput: BasicPensionComponentInput = { ruleDate: '2026-10-12', parametersConfirmed: true, componentApplicableConfirmed: true, basicReviewConfirmed: true, specialCase: 'transitional-or-deemed', confirmedCalculationWageCents: 1000000, confirmedServiceYearsHundredths: 4000 };
test('扩域独审京浙真实基础分项：40年已核中人算式，不暗加其他待遇', () => {
  for (const rule of LABOR_PENSION_COMPONENT_RULES) {
    assert.ok(rule.basicReviewEvidence); assert.ok(rule.basicReviewEvidence.scope.population.includes('中人'));
    const result = calculateBasicPensionComponent(componentInput, rule); assert.ok(result.ok, JSON.stringify(result));
    assert.equal(result.lines.length, 1); assert.equal(result.lines[0].id, 'pension-basic-component-review'); assert.equal(result.lines[0].amountCents, 400000);
    assert.deepEqual(result.lines[0].scope, rule.basicReviewEvidence.scope); assert.deepEqual(result.lines[0].sourceIds, rule.basicReviewEvidence.sourceIds);
    for (const id of result.lines[0].sourceIds) assert.ok(LABOR_SOURCES[id]);
    assert.match(result.warnings.join(';'), /不.*资格|不从N推断退休资格/);
    for (const [years, amount] of [[0, 0], [500, 50000], [3508, 350800]]) {
      const partial = calculateBasicPensionComponent({ ...componentInput, confirmedServiceYearsHundredths: years }, rule);
      assert.ok(partial.ok); assert.equal(partial.lines[0].amountCents, amount); assert.match(partial.warnings.join(';'), /可领取证明|资格/);
    }
  }
});

test('扩域独审京浙基础确认、身份、原文有效期与尾差门禁', () => {
  for (const rule of LABOR_PENSION_COMPONENT_RULES) {
    for (const patch of [
      { basicReviewConfirmed: false }, { parametersConfirmed: false }, { componentApplicableConfirmed: false },
      { specialCase: 'unknown' as const }, { specialCase: 'special-population' as const }, { ruleDate: '2027-01-01' },
      { confirmedServiceYearsHundredths: -1 }, { confirmedServiceYearsHundredths: 4000.5 },
      { confirmedCalculationWageCents: 1000001 }, { confirmedCalculationWageCents: 100000000000, confirmedServiceYearsHundredths: Number.MAX_SAFE_INTEGER },
    ]) assert.equal(calculateBasicPensionComponent({ ...componentInput, ...patch }, rule).ok, false, JSON.stringify(patch));
    const broken = structuredClone(rule); broken.basicReviewEvidence!.sourceIds = [];
    assert.equal(calculateBasicPensionComponent(componentInput, broken).ok, false);
    broken.basicReviewEvidence = structuredClone(rule.basicReviewEvidence)!; broken.basicReviewEvidence.scope.validTo = '2026-09-30';
    assert.equal(calculateBasicPensionComponent(componentInput, broken).ok, false);
  }
});

test('扩域独审账户隔离：基础中人准入不扩账户范围，不读取基础证据', () => {
  for (const original of LABOR_PENSION_COMPONENT_RULES) {
    const rule = structuredClone(original);
    Object.defineProperty(rule, 'basicReviewEvidence', { get() { throw new Error('账户不得读取基础扩域证据'); } });
    const account = { ruleDate: '2026-10-12', parametersConfirmed: true, componentApplicableConfirmed: true, specialCase: 'none' as const, confirmedBalanceCents: 13900000, confirmedRetirementAgeYears: 60, confirmedDivisorMonths: 139 };
    const result = calculateAccountPensionComponent(account, rule); assert.ok(result.ok); assert.equal(result.lines[0].amountCents, 100000);
    assert.deepEqual(result.lines[0].scope, rule.scope);
    assert.equal(calculateAccountPensionComponent({ ...account, specialCase: 'transitional-or-deemed' }, rule).ok, false);
  }
});

test('扩域独审原计划候选：12万元余额保留6358.60确定方案，不提升最低性结论', () => {
  const input = request(600000); input.plan.account!.balanceCents = 12000000;
  const before = structuredClone(input), result = solvePensionPlanTarget(input, rules());
  const current = result.candidates.find(c => c.matchesExistingPlan)!; assert.ok(current);
  assert.equal(current.baseCents, 1257700); assert.equal(current.monthlyPensionCents, 635860); assert.equal(current.months, 196);
  assert.equal(current.personalMonthlyCents, 100616); assert.equal(current.personalTotalCents, 19720736);
  assert.equal(result.candidates[0].baseCents, 1257700); assert.ok(result.candidates.some(c => c.baseCents === 3773100));
  assert.deepEqual(input, before);
  const noOriginal = structuredClone(input); noOriginal.plan.future = [];
  const baseline = solvePensionPlanTarget(noOriginal, rules());
  assert.deepEqual(result.rangeSearch, baseline.rangeSearch); assert.equal(result.minimumStatus, baseline.minimumStatus);
  assert.equal(result.status, 'feasible');
  for (let i = 1; i < result.candidates.length; i++) assert.ok(result.candidates[i - 1].personalTotalCents <= result.candidates[i].personalTotalCents);
  const forward = calculatePensionPlan({ ...input.plan, future: current.future }, rules());
  assert.equal(forward.status, 'supported'); assert.equal(forward.lines.find(l => l.id === 'planner-pension-monthly')!.amountCents, 635860);
});

test('扩域独审原计划拒混入：预算一分、日期/制度/省份/区间/未知后续', () => {
  const base = request(500000); base.plan.account!.balanceCents = 12000000;
  for (const mutate of [
    (p: typeof base) => { p.maximumPersonalMonthlyCents = 100615; },
    (p: typeof base) => { p.plan.future[0].from = '2026-11'; },
    (p: typeof base) => { p.plan.future[0].to = '2042-12'; },
    (p: typeof base) => { p.plan.future[0].province = '浙江'; },
    (p: typeof base) => { p.plan.future[0].regime = 'flexible'; p.plan.flexibleEligibilityConfirmed = true; },
    (p: typeof base) => { p.plan.future[0].baseCents = 1000000; }, // Target met, but original forward is a tenth-yuan interval.
    (p: typeof base) => { p.plan.future[0].baseCents = 1257701; },
    (p: typeof base) => { p.plan.future[0].baseCents = 754500; },
    (p: typeof base) => { p.plan.future.push({ ...p.plan.future[0], id: 'overlap' }); },
    (p: typeof base) => { p.futureTo = '2042-12'; p.plan.future[0].to = '2042-12'; p.plan.unlistedFutureMonths = 'unknown'; },
  ]) {
    const input = structuredClone(base); mutate(input); const before = structuredClone(input);
    const result = solvePensionPlanTarget(input, rules());
    assert.ok(result.candidates.every(c => c.matchesExistingPlan !== true), JSON.stringify(input.plan.future)); assert.deepEqual(input, before);
  }
});

test('扩域独审原计划与已选边界相同时去重，未达到目标不纳入', () => {
  const input = request(600000); input.plan.account!.balanceCents = 12000000; input.plan.future[0].baseCents = 3773100;
  const r = solvePensionPlanTarget(input, rules());
  assert.equal(r.candidates.filter(c => c.baseCents === 3773100).length, 1); assert.equal(r.candidates.find(c => c.baseCents === 3773100)!.matchesExistingPlan, true);
  input.plan.future[0].baseCents = 1257700; input.targetMonthlyCents = 700000;
  const high = solvePensionPlanTarget(input, rules()); assert.ok(high.candidates.every(c => !c.matchesExistingPlan));
});
