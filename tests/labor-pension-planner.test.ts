import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePensionPlan, solvePensionPlanTarget } from '../lib/labor-pension-planner.ts';
import type { PensionPlannerInput, PensionPlannerRules } from '../lib/labor-pension-planner.ts';
import { LABOR_PENSION_PLANNER_RULES, LABOR_SOURCES } from '../lib/labor-rules.ts';
import { LABOR_PENSION_RULES } from '../lib/labor-rules.ts';
import { calculatePensionScenario } from '../lib/labor-engine.ts';
// Keep legacy finite-domain regression coverage independently of the production domain registration.
const rules = structuredClone(LABOR_PENSION_PLANNER_RULES);
delete rules.projection!.futureBaseDomain;
const expandedRules = (): PensionPlannerRules => {
  const r = structuredClone(LABOR_PENSION_PLANNER_RULES);
  r.projection!.futureBaseDomain = 'whole-yuan-range'; r.projection!.earliestHistoryMonth = '1993-01'; return r;
};
const plan = (): PensionPlannerInput => ({
  personal: { birthMonth: '1980-01', category: 'original-60', householdProvince: '上海', relationshipProvince: '上海', accountKind: 'ordinary', specialCase: 'none' },
  snapshotMonth: '2026-10', historicalRecordsConfirmed: true,
  history: [{ id: 'h', from: '2014-02', to: '2026-09', province: '上海', regime: 'employee', recognizedMonths: 152, indexSum4: 1520000 }],
  future: [{ id: 'f', from: '2026-10', to: '2043-01', province: '上海', regime: 'employee', baseCents: 1257700 }],
  account: { balanceCents: 10000000, asOfMonth: '2026-09' }, frozen2026Confirmed: true, payoutYears: 20, unlistedFutureMonths: 'paused',
});
const amount = (p: ReturnType<typeof calculatePensionPlan>, id: string) => p.lines.find(l => l.id === id)?.amountCents;

test('production Shanghai exact-rational golden: actual 2043 statutory date, 2026 frozen formula', () => {
  const p = calculatePensionPlan(plan(), rules);
  assert.equal(p.status, 'supported', p.issues.join(';'));
  assert.equal(p.retirement?.chosenRetirementMonth, '2043-01');
  assert.equal(p.retirement?.minimumContributionMonths, 240);
  assert.equal(p.totalMonths, 348); assert.equal(p.qualification, 'sufficient');
  assert.equal(amount(p, 'planner-pension-basic'), 364740);
  assert.equal(amount(p, 'planner-pension-account'), 254030);
  assert.equal(amount(p, 'planner-pension-monthly'), 618770);
  assert.equal(amount(p, 'planner-future-account'), 19720736);
  assert.equal(amount(p, 'planner-retirement-account'), 29720736);
  assert.equal(amount(p, 'planner-payout-window'), 148504800);
});

test('timeline shares retirement axis, unknown historic money is not zero or complete, window only controls receipts', () => {
  const p = calculatePensionPlan(plan(), rules);
  assert.equal(p.points[0].personalCents, null);
  assert.equal(p.points[0].personalCumulativeComplete, false);
  assert.equal(p.points.find(x => x.month === '2043-01')?.pensionCents, 0);
  assert.equal(p.points.find(x => x.month === '2043-02')?.pensionCents, 618770);
  assert.equal(p.points.at(-1)?.cumulativePersonalCents, 19720736);
  assert.equal(p.points.at(-1)?.cumulativeEmployerCents, 39441472);
  assert.equal(p.points.at(-1)?.cumulativePensionCents, 148504800);
  const shorter = calculatePensionPlan({ ...plan(), payoutYears: 1 }, rules);
  assert.equal(amount(shorter, 'planner-pension-monthly'), 618770);
  assert.equal(shorter.points.filter(p => p.phase === 'payout').length, 12);
});

test('flexible cash is full 20%, account remains 8%; no fictitious employer', () => {
  const input = plan(); input.future[0].regime = 'flexible'; input.flexibleEligibilityConfirmed = true;
  const p = calculatePensionPlan(input, rules);
  assert.equal(p.status, 'supported');
  assert.equal(p.points.at(-1)?.cumulativePersonalCents, 49301840);
  assert.equal(p.points.at(-1)?.cumulativeEmployerCents, 0);
  assert.equal(amount(p, 'planner-future-account'), 19720736);
  assert.equal(amount(p, 'planner-pension-monthly'), 618770);
});

test('missing recognized history, index, balance, future base preserve retirement and block amount', () => {
  const variants = [plan(), plan(), plan(), plan()];
  delete variants[0].history[0].recognizedMonths;
  delete variants[1].history[0].indexSum4;
  delete variants[2].account;
  delete variants[3].future[0].baseCents;
  for (const input of variants) {
    const p = calculatePensionPlan(input, rules);
    assert.equal(p.status, 'unsupported'); assert.equal(p.retirement?.chosenRetirementMonth, '2043-01');
    assert.equal(amount(p, 'planner-pension-monthly'), undefined);
  }
  assert.equal(calculatePensionPlan(variants[0], rules).qualification, 'unknown');
});

test('unknown timeline gaps, overlapping records and account cutoff prevent fake precision', () => {
  const variants = [plan(), plan(), plan(), plan()];
  variants[0].history[0].to = '2026-08'; variants[0].history[0].recognizedMonths = 151;
  variants[1].future.push({ ...variants[1].future[0], id: 'overlap' });
  variants[2].account!.asOfMonth = '2026-08';
  variants[3].future[0].to = '2042-12'; variants[3].unlistedFutureMonths = 'unknown';
  for (const input of variants) assert.equal(calculatePensionPlan(input, rules).status, 'unsupported');
});

test('explicit pause excludes months/index/cash and leaves retirement month fixed', () => {
  const input = plan(); input.history[0].from = '2014-01'; input.history[0].recognizedMonths = 153; input.history[0].indexSum4 = 1530000;
  input.future[0].to = '2042-12';
  input.future.push({ id: 'pause', from: '2043-01', to: '2043-01', province: '上海', regime: 'paused', baseCents: 0 });
  const p = calculatePensionPlan(input, rules);
  assert.equal(p.status, 'supported', p.issues.join(';')); assert.equal(p.totalMonths, 348);
  assert.equal(p.points.find(x => x.month === '2043-01')?.personalCents, 0);
});

test('unregistered base, non-integer retirement age and cross-province amount are unsupported', () => {
  const variants = [plan(), plan(), plan()];
  variants[0].future[0].baseCents = 1000000;
  variants[1].personal.birthMonth = '1966-01'; variants[1].future[0].to = '2027-01';
  variants[2].history[0].province = '浙江'; variants[2].personal.relationshipProvince = '浙江'; variants[2].future[0].province = '浙江';
  for (const input of variants) assert.equal(calculatePensionPlan(input, rules).status, 'unsupported');
});

test('qualification insufficiency is distinct from missing evidence, and future stop is not a retirement delay', () => {
  const input = plan(); input.future[0].to = '2033-10'; // 85 future + 152 history =237
  const p = calculatePensionPlan(input, rules);
  assert.equal(p.status, 'ineligible', p.issues.join(';')); assert.equal(p.qualification, 'insufficient');
  assert.equal(p.retirement?.chosenRetirementMonth, '2043-01');
  delete input.history[0].indexSum4;
  assert.equal(calculatePensionPlan(input, rules).status, 'unsupported');
});

test('base inverse enumerates discrete candidates; historical inputs remain byte-for-byte unchanged', () => {
  const input = plan(), before = JSON.stringify(input);
  const r = solvePensionPlanTarget({ plan: input, variable: 'base', futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee', targetMonthlyCents: 800000, maximumPersonalMonthlyCents: 400000 }, rules);
  assert.equal(r.status, 'multiple', r.issues.join(';')); assert.equal(r.candidates.length, 2);
  assert.deepEqual(r.candidates.map(c => c.baseCents), [2515400, 3773100]);
  assert.equal(JSON.stringify(input), before);
  for (const c of r.candidates) {
    const forward = calculatePensionPlan({ ...input, future: c.future, unlistedFutureMonths: 'paused' }, rules);
    assert.equal(amount(forward, 'planner-pension-monthly'), c.monthlyPensionCents);
    assert.equal(c.personalTotalCents, c.personalMonthlyCents*c.months);
  }
});

test('month inverse keeps base and window, gives supported-domain no-solution versus unknown', () => {
  const common = { plan: plan(), variable: 'months' as const, fixedBaseCents: 1257700, futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee' as const, maximumPersonalMonthlyCents: 110000 };
  const many = solvePensionPlanTarget({ ...common, targetMonthlyCents: 200000 }, rules);
  assert.equal(many.status, 'multiple');
  assert.equal(many.candidates[0].months, 88); assert.equal(many.candidates[0].monthlyPensionCents, 412690);
  assert.equal(many.monthSearch?.possibleMinimumMonths, 88); assert.equal(many.monthSearch?.lowerBoundMinimumMonths, 88);
  assert.equal(many.monthSearch?.thresholdStatus, 'determined'); assert.ok(many.sensitiveCandidates?.length);
  assert.ok(many.sensitiveCandidates!.every(c => c.months > 88));
  assert.ok(many.candidates.every(c => c.months+152 >= 240 && c.to <= '2043-01' && c.baseCents === 1257700));
  assert.equal(solvePensionPlanTarget({ ...common, targetMonthlyCents: 2000000 }, rules).status, 'infeasible');
  const bad = plan(); delete bad.history[0].indexSum4;
  assert.equal(solvePensionPlanTarget({ ...common, plan: bad, targetMonthlyCents: 2000000 }, rules).status, 'unsupported');
  assert.equal(solvePensionPlanTarget({ ...common, fixedBaseCents: 1000000, targetMonthlyCents: 2000000 }, rules).status, 'unsupported');
});

test('every result/candidate has registered sources and formulas; missing projection source blocks only projection', () => {
  const p = calculatePensionPlan(plan(), rules);
  for (const l of [...p.lines, ...p.points]) {
    assert.ok(l.formula.length); assert.ok(l.sourceIds.length);
    for (const id of l.sourceIds) assert.ok(LABOR_SOURCES[id], id);
  }
  const bad = structuredClone(rules) as PensionPlannerRules;
  bad.projection!.indexEvidence.sourceIds = [];
  const result = calculatePensionPlan(plan(), bad);
  assert.equal(result.status, 'unsupported'); assert.equal(result.retirement?.chosenRetirementMonth, '2043-01');
});

test('zero-month inverse needs no budget: synthetic qualification threshold tests arithmetic only', () => {
  const input = plan(); input.history[0].from = '2014-01'; input.history[0].recognizedMonths = 153; input.history[0].indexSum4 = 1530000;
  const synthetic = structuredClone(rules);
  // NOT a legal rule: lower threshold isolates the zero-contribution search mechanic.
  synthetic.retirement.minimumContributionMonthsByYear[2039] = 150;
  const r = solvePensionPlanTarget({ plan: input, variable: 'months', fixedBaseCents: 1257700, futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee', maximumPersonalMonthlyCents: 0, targetMonthlyCents: 200000 }, synthetic);
  assert.equal(r.status, 'unique', r.issues.join(';'));
  assert.equal(r.candidates[0].months, 0); assert.equal(r.candidates[0].personalMonthlyCents, 0);
  assert.equal(r.candidates[0].personalTotalCents, 0); assert.deepEqual(r.candidates[0].future, []);
});

test('unknown future does not determine a fallback province by treating unknown months as zero', () => {
  const input = plan(); input.personal.householdProvince = '北京';
  input.history[0].from = '2020-01'; input.history[0].recognizedMonths = 81; input.history[0].indexSum4 = 810000;
  input.future[0].to = '2026-10'; input.unlistedFutureMonths = 'unknown';
  const p = calculatePensionPlan(input, rules);
  assert.equal(p.qualification, 'unknown'); assert.equal(p.benefitProvince, undefined);
});

test('ordinary age domain and flexible participation require their own applicable facts', () => {
  const young = plan(); young.personal.birthMonth = '2000-01';
  assert.equal(calculatePensionPlan(young, rules).status, 'unsupported');
  const flex = plan(); flex.future[0].regime = 'flexible';
  const blocked = calculatePensionPlan(flex, rules);
  assert.equal(blocked.status, 'unsupported'); assert.ok(blocked.issues.some(s => s.includes('参保条件')));
  flex.flexibleEligibilityConfirmed = true;
  assert.equal(calculatePensionPlan(flex, rules).status, 'supported');
});

test('legacy pension entry also refuses unknown four-decimal service-year rounding', () => {
  const rule = LABOR_PENSION_RULES[0];
  const input = { ruleYear: 2026, ruleDate: '2026-10-12', population: rule.supportedPopulation,
    benefitRegionConfirmed: true, qualificationConfirmed: true, hasTransitionalOrDeemedService: false,
    retirementAgeMonths: 756, contributionMonths: 240, pensionBaseCents: 1257700,
    averageContributionIndex: 1, personalAccountCents: 11700000, payoutYears: 20 };
  assert.equal(calculatePensionScenario(input, rule).ok, true);
  for (const contributionMonths of [241, 242]) {
    const blocked = calculatePensionScenario({ ...input, contributionMonths }, rule);
    assert.equal(blocked.ok, false); if (!blocked.ok) assert.match(blocked.errors.join(''), /四位/);
  }
  assert.equal(calculatePensionScenario({ ...input, contributionMonths: 243 }, rule).ok, true);
});

test('inverse diagnostics use all budget-feasible candidates, not only those meeting target', () => {
  const common = { plan: plan(), variable: 'base' as const, futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee' as const, targetMonthlyCents: 2000000 };
  const full = solvePensionPlanTarget({ ...common, maximumPersonalMonthlyCents: 500000 }, rules);
  assert.equal(full.status, 'infeasible'); assert.equal(full.attainableMaximumMonthlyCents, 1161290);
  assert.equal(full.bestCandidate?.baseCents, 3773100); assert.ok(full.bestCandidate?.lines.length);
  assert.ok(full.constraints?.some(s => s.includes('未排除')));
  const budget = solvePensionPlanTarget({ ...common, maximumPersonalMonthlyCents: 201232 }, rules);
  assert.equal(budget.attainableMaximumMonthlyCents, 890030);
  assert.ok(budget.constraints?.some(s => s.includes('被个人月预算')));
  const none = solvePensionPlanTarget({ ...common, maximumPersonalMonthlyCents: 100615 }, rules);
  assert.equal(none.status, 'infeasible'); assert.equal(none.attainableMaximumMonthlyCents, undefined);
});

test('retirement-month evidence and flexible prior-month eligibility have distinct gates', () => {
  const bad = structuredClone(rules); delete bad.projection!.employeeRetirementMonthEvidence;
  assert.equal(calculatePensionPlan(plan(), bad).status, 'unsupported');
  const inverse = solvePensionPlanTarget({ plan: plan(), variable: 'months', fixedBaseCents: 1257700, futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee', targetMonthlyCents: 200000, maximumPersonalMonthlyCents: 200000 }, bad);
  assert.equal(inverse.status, 'unsupported'); assert.deepEqual(inverse.candidates, []);
  assert.equal(inverse.attainableMaximumMonthlyCents, undefined);
  const input = plan(); input.future[0].from = '2035-10'; input.future[0].regime = 'flexible'; input.flexibleEligibilityConfirmed = true;
  const p = calculatePensionPlan(input, rules);
  assert.equal(p.totalMonths, 240); assert.equal(p.status, 'unsupported');
  assert.ok(p.issues.some(s => s.includes('前月已满')));
});

test('independent year-envelope goldens admit 347 and 349 months without choosing four-decimal rounding', () => {
  const a = plan(); a.future[0].to = '2042-12';
  const resultA = calculatePensionPlan(a, expandedRules());
  assert.equal(resultA.totalMonths, 347); assert.equal(resultA.status, 'supported', resultA.issues.join(';'));
  assert.equal(amount(resultA, 'planner-pension-basic'), 363690);
  const b = plan(); b.history[0].from = '2014-01'; b.history[0].recognizedMonths = 153; b.history[0].indexSum4 = 1530000;
  const resultB = calculatePensionPlan(b, expandedRules());
  assert.equal(resultB.totalMonths, 349); assert.equal(resultB.status, 'supported');
  assert.equal(amount(resultB, 'planner-pension-basic'), 365790);
});

test('independent sensitive-year golden keeps both endpoints and never emits a single pension', () => {
  const input = plan(); input.history[0].from = '2014-01'; input.history[0].recognizedMonths = 153;
  input.history[0].indexSum4 = 1440086; // Plus 1960000 future gives independent Q=3400086, M=349.
  const result = calculatePensionPlan(input, expandedRules());
  assert.equal(result.status, 'unsupported');
  assert.equal(result.roundingDiagnostic?.basicMinimumCents, 361070);
  assert.equal(result.roundingDiagnostic?.basicMaximumCents, 361080);
  assert.equal(amount(result, 'planner-pension-monthly'), undefined);
  assert.equal(result.points.find(p => p.phase === 'payout')?.pensionCents, null);
});

test('arbitrary whole-yuan future base produces an index envelope; cents and out-of-range bases remain blocked', () => {
  const input = plan(); input.future[0].baseCents = 1000000;
  const result = calculatePensionPlan(input, expandedRules());
  assert.equal(result.roundingDiagnostic?.monthlyMinimumCents, 563180);
  assert.equal(result.roundingDiagnostic?.monthlyMaximumCents, 563190);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.points.find(p => p.phase === 'future')?.personalCents, 80000);
  assert.equal(result.points.find(p => p.phase === 'future')?.employerCents, 160000);
  for (const baseCents of [754599, 754601, 3773200]) {
    input.future[0].baseCents = baseCents;
    const invalid = calculatePensionPlan(input, expandedRules());
    assert.equal(invalid.status, 'unsupported'); assert.equal(invalid.roundingDiagnostic, undefined);
  }
});

test('pre-2014 agency-adjusted monthly-index sums require an explicit confirmation and historical floors', () => {
  const input = plan(); input.personal.birthMonth = '1977-01'; input.future = [];
  input.history = [{ id: 'early', from: '1993-01', to: '2026-09', province: '上海', regime: 'employee', recognizedMonths: 405, indexSum4: 4050000 }];
  assert.equal(calculatePensionPlan(input, expandedRules()).status, 'unsupported');
  input.historyIndexTreatment = 'agency-2026-adjusted';
  assert.equal(calculatePensionPlan(input, expandedRules()).status, 'supported');
  input.history[0].indexSum4 = 2000000;
  assert.ok(calculatePensionPlan(input, expandedRules()).issues.some(i => i.includes('逐月保底')));
  input.history[0].indexSum4 = 4050000; input.history[0].from = '1992-12'; input.history[0].recognizedMonths = 406;
  assert.equal(calculatePensionPlan(input, expandedRules()).status, 'unsupported');
});

test('whole-yuan inverse finds monotone boundaries logarithmically and separates uncertainty from infeasibility', () => {
  const input = { plan: plan(), variable: 'base' as const, futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee' as const,
    targetMonthlyCents: 800000, maximumPersonalMonthlyCents: 400000 };
  const before = JSON.stringify(input.plan), result = solvePensionPlanTarget(input, expandedRules());
  assert.equal(result.status, 'feasible'); assert.equal(result.minimumStatus, 'threshold-only');
  assert.deepEqual(result.candidates.map(c => c.baseCents), [3773100]);
  assert.equal(result.candidates[0].monthlyPensionCents, 1161290);
  assert.equal(result.rangeSearch?.possibleMinimumBaseCents, 2098000);
  assert.equal(result.rangeSearch?.lowerBoundMinimumBaseCents, 2098000);
  assert.ok(result.evaluatedCandidates <= 35); assert.equal(JSON.stringify(input.plan), before);
  const impossible = solvePensionPlanTarget({ ...input, targetMonthlyCents: 2000000 }, expandedRules());
  assert.equal(impossible.status, 'infeasible');
  assert.equal(impossible.rangeSearch?.maximumMonthlyMaximumCents, 1161290);
  assert.equal(impossible.attainableMaximumMonthlyCents, 1161290);
  const missing = structuredClone(input); delete missing.plan.history[0].indexSum4;
  assert.equal(solvePensionPlanTarget({ ...missing, maximumPersonalMonthlyCents: 0 }, expandedRules()).status, 'unsupported');
});

test('month search preserves later exact solutions while an earlier sensitive candidate leaves the minimum uncertain', () => {
  const input = { plan: plan(), variable: 'months' as const, fixedBaseCents: 1257700, futureFrom: '2026-10', futureTo: '2043-01',
    regime: 'employee' as const, targetMonthlyCents: 422235, maximumPersonalMonthlyCents: 400000 };
  const result = solvePensionPlanTarget(input, expandedRules());
  assert.equal(result.status, 'feasible'); assert.equal(result.minimumStatus, 'uncertain');
  assert.equal(result.monthSearch?.possibleMinimumMonths, 93);
  assert.equal(result.monthSearch?.lowerBoundMinimumMonths, 94);
  assert.equal(result.candidates[0].months, 94);
  assert.ok(result.candidates.every(c => c.monthlyPensionCents >= input.targetMonthlyCents));
  const noExact = solvePensionPlanTarget({ ...input, fixedBaseCents: 1000000, targetMonthlyCents: 563185 }, expandedRules());
  assert.equal(noExact.status, 'unsupported'); assert.equal(noExact.minimumStatus, 'uncertain');
  assert.deepEqual(noExact.candidates, []); assert.equal(noExact.monthSearch?.possibleMinimumMonths, 196);
  assert.equal(noExact.sensitiveCandidates?.[0].targetRelation, 'overlaps');
});

test('base search retains a proved exact higher solution without claiming its base is the minimum', () => {
  const input = { plan: plan(), variable: 'base' as const, futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee' as const,
    targetMonthlyCents: 600000, maximumPersonalMonthlyCents: 400000 };
  const result = solvePensionPlanTarget(input, expandedRules());
  assert.equal(result.status, 'feasible'); assert.notEqual(result.minimumStatus, 'exact-candidate');
  assert.equal(result.candidates.at(-1)?.baseCents, 3773100);
  assert.equal(result.candidates.at(-1)?.monthlyPensionCents, 1161290);
  const forward = calculatePensionPlan({ ...input.plan, future: result.candidates.at(-1)!.future }, expandedRules());
  assert.equal(forward.status, 'supported');
  assert.equal(amount(forward, 'planner-pension-monthly'), result.candidates.at(-1)?.monthlyPensionCents);
});

test('base inverse includes a matching affordable current plan without changing minimum diagnostics', () => {
  const current = plan(); current.account!.balanceCents = 12000000;
  const input = { plan: current, variable: 'base' as const, futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee' as const,
    targetMonthlyCents: 600000, maximumPersonalMonthlyCents: 400000 };
  const before = JSON.stringify(current), result = solvePensionPlanTarget(input, expandedRules());
  const noCurrent = solvePensionPlanTarget({ ...input, plan: { ...current, future: [] } }, expandedRules());
  assert.equal(result.minimumStatus, noCurrent.minimumStatus);
  assert.deepEqual(result.rangeSearch, noCurrent.rangeSearch);
  assert.deepEqual(result.candidates.map(c => c.baseCents), [1257700, 3773100]);
  assert.equal(result.candidates[0].monthlyPensionCents, 635860);
  assert.equal(result.candidates[0].matchesExistingPlan, true);
  assert.deepEqual(result.candidates[0].future, current.future);
  assert.equal(JSON.stringify(current), before);
  const capped = solvePensionPlanTarget({ ...input, maximumPersonalMonthlyCents: 100000 }, expandedRules());
  assert.ok(capped.candidates.every(c => c.baseCents !== 1257700));
  const sameAsMaximum = structuredClone(input); sameAsMaximum.plan.future[0].baseCents = 3773100;
  const duplicate = solvePensionPlanTarget(sameAsMaximum, expandedRules());
  assert.equal(duplicate.candidates.filter(c => c.baseCents === 3773100).length, 1);
  assert.equal(duplicate.candidates.find(c => c.baseCents === 3773100)?.matchesExistingPlan, true);
});

test('base inverse does not import a current plan with mismatching dates, regime, region or nonexact amount', () => {
  const input = { plan: plan(), variable: 'base' as const, futureFrom: '2026-10', futureTo: '2043-01', regime: 'employee' as const,
    targetMonthlyCents: 200000, maximumPersonalMonthlyCents: 400000 };
  const variants = [plan(), plan(), plan(), plan(), plan()];
  variants[0].future[0].from = '2026-11';
  variants[1].future[0].regime = 'flexible'; variants[1].flexibleEligibilityConfirmed = true;
  variants[2].future[0].province = '北京';
  variants[3].future[0].baseCents = 1000000;
  variants[4].future.push({ ...variants[4].future[0], id: 'extra' });
  for (const current of variants) {
    const result = solvePensionPlanTarget({ ...input, plan: current }, expandedRules());
    assert.ok(result.candidates.every(c => !c.matchesExistingPlan));
  }
});
