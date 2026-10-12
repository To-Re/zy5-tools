import { calculateRetirement } from './labor-engine.ts';
import type { Evidence, ResultLine, RetirementCategory, RetirementRule, RetirementSuccess } from './labor-engine';
import type { BenefitProvinceRule } from './labor-benefit-province';

export interface PensionPlannerHistory {
  id: string; from: string; to: string; province: string;
  regime: 'employee' | 'flexible' | 'paused';
  recognizedMonths?: number;
  /** Sum of agency-confirmed FOUR-decimal monthly indices, scaled by 10000. NOT rounded mean × months. */
  indexSum4?: number;
  personalMonthlyCents?: number; employerMonthlyCents?: number;
}
export interface PensionPlannerFuture {
  id: string; from: string; to: string; province: string;
  regime: 'employee' | 'flexible' | 'paused'; baseCents?: number;
}
export interface PensionPlannerInput {
  personal: { birthMonth: string; category: RetirementCategory; householdProvince: string;
    relationshipProvince: string; accountKind: 'ordinary' | 'temporary' | 'unknown';
    specialCase: 'none' | 'unknown' | 'special' };
  snapshotMonth: '2026-10'; historicalRecordsConfirmed: boolean;
  /** Agency monthly-index sum already applies the 2026 attachment, including pre-2014 index floors. */
  historyIndexTreatment?: 'agency-2026-adjusted';
  history: PensionPlannerHistory[]; future: PensionPlannerFuture[];
  /** Balance includes every historical entry through the prior month. No future credit may precede this cutoff. */
  account?: { balanceCents: number; asOfMonth: string };
  frozen2026Confirmed: boolean; payoutYears: number;
  unlistedFutureMonths: 'unknown' | 'paused';
  /** Current Shanghai flexible-participation eligibility has been verified; future continuation remains an assumption. */
  flexibleEligibilityConfirmed?: boolean;
}
export interface PensionPlannerRule extends Evidence {
  id: string; snapshotDate: string; province: '上海';
  pensionBaseCents: number; indexReferenceCents: number;
  futureBaseOptionsCents: number[];
  /** Options remain examples when the whole-yuan domain is enabled. */
  futureBaseDomain?: 'whole-yuan-range';
  minimumBaseCents: number; maximumBaseCents: number;
  employeePersonalRateBps: number; employeeEmployerRateBps: number;
  flexiblePersonalRateBps: number; accountCreditRateBps: number;
  accountDivisors: Record<number, number>;
  /** Earliest ordinary-history month; pre-2014 monthly sums require explicit agency adjustment. */
  earliestHistoryMonth: string;
  contributionEvidence: Evidence; indexEvidence: Evidence; formulaEvidence: Evidence;
  accountEvidence: Evidence; payoutEvidence: Evidence;
  employeeRetirementMonthEvidence?: Evidence;
  flexibleRetirementMonthEvidence?: Evidence;
}
export interface PensionPlannerRules {
  retirement: RetirementRule; province: BenefitProvinceRule; projection?: PensionPlannerRule;
}
export interface PensionPlannerPoint extends Evidence {
  formula: string;
  month: string; phase: 'history' | 'future' | 'payout';
  personalCents: number | null; employerCents: number | null; pensionCents: number | null;
  cumulativePersonalCents: number; cumulativeEmployerCents: number; cumulativePensionCents: number | null;
  /** False means cumulative payments cover recorded amounts only; unknown history is NEVER zero-filled. */
  personalCumulativeComplete: boolean; employerCumulativeComplete: boolean;
}
export interface PensionPlanResult {
  status: 'supported' | 'unsupported' | 'ineligible';
  qualification: 'unknown' | 'sufficient' | 'insufficient';
  retirement?: RetirementSuccess;
  benefitProvince?: Evidence & { province: string; conditional: true; explanation: string };
  historicalMonths?: number; futureMonths?: number; totalMonths?: number;
  lines: ResultLine[]; points: PensionPlannerPoint[]; issues: string[]; warnings: string[];
  roundingDiagnostic?: Evidence & {
    basicMinimumCents: number; basicMaximumCents: number;
    monthlyMinimumCents: number; monthlyMaximumCents: number; explanation: string;
  };
}
export type PensionPlannerInverseInput = {
  plan: PensionPlannerInput; targetMonthlyCents: number; futureFrom: string; futureTo: string;
  regime: 'employee' | 'flexible'; maximumPersonalMonthlyCents: number;
} & ({ variable: 'months'; fixedBaseCents: number } | { variable: 'base' });
export interface PensionPlannerCandidate extends Evidence {
  from: string; to: string; baseCents: number; months: number;
  personalMonthlyCents: number; personalTotalCents: number; monthlyPensionCents: number;
  future: PensionPlannerFuture[];
  matchesExistingPlan?: true;
  lines: ResultLine[];
}

export const PENSION_PLANNER_CONFIRMATION = '将2026年10月已核规则、基数上下限、社平和比例固定到未来；工资及待遇参数不增长，账户未来利息为0，不预测实际权益。假设法定退休月办妥申领，次月起按本次月额展示；领取窗口只是累计观察期。';

function month(value: string): number {
  if (!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('年月须为1900—2099内的 YYYY-MM');
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1;
}
function ym(value: number): string { return `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, '0')}`; }
function integer(value: number, min: number, max: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label}超出支持范围`);
}
function money(value: number, label: string): void { integer(value, 0, 100_000_000_000, `${label}（非负整数分）`); }
function validDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
function evidence(value: Evidence, snapshot: string, parent?: Evidence): void {
  if (!value?.sourceIds?.length || value.sourceIds.some((id) => !id.trim() || (parent && !parent.sourceIds.includes(id))) ||
    !value.scope.region || !value.scope.population || !validDate(value.scope.verifiedOn) || !validDate(value.scope.validFrom) || !validDate(value.scope.validTo) ||
    snapshot < value.scope.validFrom || snapshot > value.scope.validTo) throw new Error('缺少覆盖快照日期的完整规则、适用范围或来源');
}
function exact(n: bigint, d: bigint, label: string): number {
  if (d <= BigInt(0) || n % d !== BigInt(0)) throw new Error(`${label}需要尚未核定的尾数处理，本版只支持精确子域`);
  const v = Number(n / d); if (!Number.isSafeInteger(v)) throw new Error(`${label}超出精确整数范围`); return v;
}
function ceilJiao(n: bigint, d: bigint): number {
  if (n < BigInt(0) || d <= BigInt(0)) throw new Error('养老金公式参数无效');
  const v = Number((n + d * BigInt(10) - BigInt(1)) / (d * BigInt(10)) * BigInt(10));
  if (!Number.isSafeInteger(v)) throw new Error('养老金超出精确整数范围'); return v;
}
function line(id: string, label: string, amountCents: number, formula: string, rule: Evidence): ResultLine {
  if (!Number.isSafeInteger(amountCents)) throw new Error('结果超出精确整数分范围');
  return { id, label, amountCents, formula, sourceIds: [...rule.sourceIds], scope: { ...rule.scope } };
}
function checkedRule(rule: PensionPlannerRule, snapshot: string): void {
  if (!validDate(rule.snapshotDate) || rule.snapshotDate.slice(0, 7) !== snapshot || rule.province !== '上海') throw new Error('缺少上海2026年10月冻结规则快照');
  evidence(rule, rule.snapshotDate);
  for (const e of [rule.contributionEvidence, rule.indexEvidence, rule.formulaEvidence, rule.accountEvidence, rule.payoutEvidence]) evidence(e, rule.snapshotDate, rule);
  money(rule.pensionBaseCents, '冻结待遇基数'); money(rule.indexReferenceCents, '指数分母');
  if (!rule.indexReferenceCents || !rule.pensionBaseCents) throw new Error('冻结社平参数必须大于0');
  money(rule.minimumBaseCents, '基数下限'); money(rule.maximumBaseCents, '基数上限');
  if (rule.maximumBaseCents < rule.minimumBaseCents || !rule.futureBaseOptionsCents.length || rule.futureBaseOptionsCents.length > 100 || new Set(rule.futureBaseOptionsCents).size !== rule.futureBaseOptionsCents.length) throw new Error('离散未来档位规则不完整');
  for (const rate of [rule.employeePersonalRateBps, rule.employeeEmployerRateBps, rule.flexiblePersonalRateBps, rule.accountCreditRateBps]) integer(rate, 1, 10000, '养老比例');
  if (rule.accountCreditRateBps > Math.min(rule.employeePersonalRateBps, rule.flexiblePersonalRateBps)) throw new Error('账户入账不能超过个人养老缴费');
  for (const base of rule.futureBaseOptionsCents) {
    money(base, '未来档位');
    if (base < rule.minimumBaseCents || base > rule.maximumBaseCents) throw new Error('未来档位超出冻结法定基数范围');
    exact(BigInt(base) * BigInt(10000), BigInt(rule.indexReferenceCents), '月指数四位');
  }
  if (month(rule.earliestHistoryMonth) < month('1993-01')) throw new Error('本版不开放1993年以前的历史');
}
function futureCash(base: number, regime: 'employee' | 'flexible', rule: PensionPlannerRule) {
  money(base, '未来养老基数');
  if (rule.futureBaseDomain === 'whole-yuan-range') {
    if (base % 100 || base < rule.minimumBaseCents || base > rule.maximumBaseCents) throw new Error('未来基数须在冻结上下限内，按整数元填写');
  } else if (!rule.futureBaseOptionsCents.includes(base)) throw new Error('该基数不在本站已核验的离散情景档位；不代表其不合法');
  const numerator = BigInt(base) * BigInt(10000), denominator = BigInt(rule.indexReferenceCents);
  return {
    personal: exact(BigInt(base) * BigInt(regime === 'employee' ? rule.employeePersonalRateBps : rule.flexiblePersonalRateBps), BigInt(10000), '个人养老月额'),
    employer: regime === 'flexible' ? 0 : exact(BigInt(base) * BigInt(rule.employeeEmployerRateBps), BigInt(10000), '单位养老月额'),
    account: exact(BigInt(base) * BigInt(rule.accountCreditRateBps), BigInt(10000), '账户入账月额'),
    indexLower4: Number(numerator / denominator),
    indexUpper4: Number((numerator + denominator - BigInt(1)) / denominator),
  };
}

function historicalFloorSum4(from: number, to: number): number {
  let sum = 0;
  for (let m = from; m <= to; m++) {
    const year = Math.floor(m / 12);
    sum += year <= 2011 ? 10000 : year === 2012 ? 8500 : year === 2013 ? 7500 : 0;
  }
  return sum;
}

/** Immutable history + explicit future scenario. Never changes the old 2026-only pension API's scope. */
export function calculatePensionPlan(input: PensionPlannerInput, rules: PensionPlannerRules): PensionPlanResult {
  return calculatePensionPlanInternal(input, rules, true);
}
function calculatePensionPlanInternal(input: PensionPlannerInput, rules: PensionPlannerRules, includePoints: boolean): PensionPlanResult {
  const out: PensionPlanResult = { status: 'unsupported', qualification: 'unknown', lines: [], points: [], issues: [], warnings: [
    PENSION_PLANNER_CONFIRMATION,
    '历史指数和必须来自经办逐月四位指数的核定合计；已舍入平均指数乘月数不能还原它。历史账户余额不等于累计个人投入。',
    '金额仅限上海普通实际缴费及已核整岁除数；1993—2013历史须有含法定保底的经办月指数和。未知四位取舍采用上下界检验，只有最终金额一致才输出精确值。',
  ] };
  const fail = (message: string) => { out.issues.push(message); };
  try {
    // Date is independent of unknown history, account balances and projection evidence.
    const date = calculateRetirement({ birthMonth: input.personal.birthMonth, category: input.personal.category, contributionMonths: 0, choice: 'statutory' }, rules.retirement);
    if (!date.ok) throw new Error(date.errors.join('；'));
    out.retirement = date;
    if (input.snapshotMonth !== '2026-10') throw new Error('本版只开放2026年10月快照');
    integer(input.payoutYears, 1, 60, '领取观察年数');
    const cutoff = month(input.snapshotMonth) - 1, retire = month(date.chosenRetirementMonth), birth = month(input.personal.birthMonth);
    if (retire <= cutoff) throw new Error('退休月已在历史截止期内，需退休时核定记录；本版只规划尚未退休的未来');
    if (input.history.length > 100 || input.future.length > 100) throw new Error('历史和未来各最多100段');
    if (!['ordinary', 'temporary', 'unknown'].includes(input.personal.accountKind)) throw new Error('养老账户性质无效');
    const history = [...input.history].sort((a, b) => month(a.from) - month(b.from));
    const future = [...input.future].sort((a, b) => month(a.from) - month(b.from));
    const ids = new Set<string>(), occupied = new Set<number>();
    let knownHistory = true, h = 0, f = 0, indexSum4 = 0;
    const historyPoints = new Map<number, { personal: number | null; employer: number | null }>();
    for (const seg of history) {
      const from = month(seg.from), to = month(seg.to), span = to - from + 1;
      if (!seg.id || ids.has(seg.id) || !seg.province.trim() || from <= birth || to > cutoff || span < 1 || span > 720) throw new Error('历史标识、地区、日期或出生前缴费无效');
      ids.add(seg.id);
      if (!['employee', 'flexible', 'paused'].includes(seg.regime)) throw new Error('居民及未知制度不能混入职工养老规划');
      if (seg.regime !== 'paused' && from < birth + 192) throw new Error('未满16岁的历史或特殊参保不在本工具普通支持域，需经办核定；不据此判断历史缴费非法');
      if (seg.recognizedMonths === undefined) knownHistory = false;
      else { integer(seg.recognizedMonths, 0, span, '历史认可月数'); h += seg.recognizedMonths; }
      if (seg.regime === 'paused' && (seg.recognizedMonths !== 0 || (seg.indexSum4 ?? 0) !== 0 || (seg.personalMonthlyCents ?? 0) !== 0 || (seg.employerMonthlyCents ?? 0) !== 0)) throw new Error('明确停缴段必须为0认可月及0投入/指数');
      if (seg.indexSum4 !== undefined) { integer(seg.indexSum4, 0, span * 1_000_000, '核定月指数合计'); indexSum4 += seg.indexSum4; }
      for (const value of [seg.personalMonthlyCents, seg.employerMonthlyCents]) if (value !== undefined) money(value, '历史实缴月额');
      if (seg.regime === 'flexible' && (seg.employerMonthlyCents ?? 0) !== 0) throw new Error('灵活就业历史不能填单位缴费');
      for (let m = from; m <= to; m++) {
        if (occupied.has(m)) throw new Error('历史月份重叠，不重复累计权益或现金'); occupied.add(m);
        historyPoints.set(m, { personal: seg.regime === 'paused' ? 0 : seg.personalMonthlyCents ?? null, employer: seg.regime === 'paused' || seg.regime === 'flexible' ? 0 : seg.employerMonthlyCents ?? null });
      }
    }
    if (history.length) for (let m = month(history[0].from); m <= cutoff; m++) if (!occupied.has(m)) {
      knownHistory = false; fail('历史时间线有未说明月份；补充经历或明确停缴，不能把缺失当0'); break;
    }
    const projectedPoints = new Map<number, ReturnType<typeof futureCash>>();
    let futureValid = true, futureIndexLower4 = 0, futureIndexUpper4 = 0, accountAdded = 0;
    const projection = rules.projection;
    if (!projection) fail('缺少已审核的冻结养老金规划规则；退休时间仍可查看');
    else { try { checkedRule(projection, input.snapshotMonth); } catch (e) { fail((e as Error).message); futureValid = false; } }
    for (const seg of future) {
      const from = month(seg.from), to = month(seg.to), span = to - from + 1;
      if (!seg.id || ids.has(seg.id) || !seg.province.trim() || from <= cutoff || to > retire || span < 1 || span > 720) throw new Error('未来段须在快照月至法定退休月内，标识不能重复');
      ids.add(seg.id);
      if (!['employee', 'flexible', 'paused'].includes(seg.regime)) throw new Error('未来制度不支持');
      if (seg.regime !== 'paused' && from < birth + 192) throw new Error('未满16岁的未来参保不在本工具普通支持域');
      if (seg.baseCents !== undefined) money(seg.baseCents, '未来养老基数');
      for (let m = from; m <= to; m++) { if (occupied.has(m)) throw new Error('未来月份重叠'); occupied.add(m); }
      if (seg.regime === 'paused') {
        if (seg.baseCents !== 0) throw new Error('明确停缴段基数应为0');
        for (let m = from; m <= to; m++) projectedPoints.set(m, { personal: 0, employer: 0, account: 0, indexLower4: 0, indexUpper4: 0 });
        continue;
      }
      f += span;
      if (!projection || !futureValid) continue;
      try {
        if (seg.baseCents === undefined) throw new Error('缺少未来缴费档位，金额未知；退休日期仍可查看');
        if (seg.province !== projection.province) throw new Error('未来跨省缴费关系与指数归集尚未开放；不能默认转为普通关系');
        const cash = futureCash(seg.baseCents, seg.regime, projection);
        for (let m = from; m <= to; m++) projectedPoints.set(m, cash);
        futureIndexLower4 += cash.indexLower4 * span; futureIndexUpper4 += cash.indexUpper4 * span; accountAdded += cash.account * span;
      } catch (e) { fail((e as Error).message); futureValid = false; }
    }
    let futureComplete = true;
    for (let m = cutoff + 1; m <= retire; m++) if (!occupied.has(m)) {
      if (input.unlistedFutureMonths === 'paused') projectedPoints.set(m, { personal: 0, employer: 0, account: 0, indexLower4: 0, indexUpper4: 0 });
      else futureComplete = false;
    }
    if (!futureComplete) fail('未来未列月份状态未知；请补段或明确未列月份停缴，不自动当0');
    if (input.historicalRecordsConfirmed !== true) fail('历史记录尚未确认完整及实际认可月数，资格与金额不能确定');
    if (knownHistory && input.historicalRecordsConfirmed === true && futureComplete) {
      out.historicalMonths = h; out.futureMonths = f; out.totalMonths = h + f;
      const qualified = calculateRetirement({ birthMonth: input.personal.birthMonth, category: input.personal.category, contributionMonths: h + f, choice: 'statutory' }, rules.retirement);
      if (!qualified.ok) throw new Error(qualified.errors.join('；'));
      out.retirement = qualified;
      out.qualification = qualified.contributionSufficient ? 'sufficient' : 'insufficient';
    } else if (!knownHistory) fail('缺少历史认可月数；出生年月所对应退休日期不受此缺项影响');
    // The province result is expressly conditional on retaining the ordinary relationship.
    try {
      const pr = rules.province; evidence(pr, '2026-10-12');
      if (input.historicalRecordsConfirmed !== true || !knownHistory || !futureComplete || input.personal.accountKind !== 'ordinary' || input.personal.specialCase !== 'none') throw new Error('完整普通关系经历/未来月份状态/账户性质未明确，领取省份暂不能判断');
      for (const p of [input.personal.householdProvince, input.personal.relationshipProvince, ...history.map(s => s.province)]) if (!pr.supportedProvinces.includes(p)) throw new Error('领取地须使用已支持的省级地区');
      const paid = history.filter(s => s.regime !== 'paused');
      if (paid.length && paid.at(-1)!.province !== input.personal.relationshipProvince) throw new Error('历史最后普通关系省与当前正式关系省不一致');
      if (future.some(s => s.regime !== 'paused' && s.province !== input.personal.relationshipProvince)) throw new Error('未来跨省关系性质未知，不能自动认定领取省');
      const totals = new Map<string, number>();
      for (const s of paid) totals.set(s.province, (totals.get(s.province) ?? 0) + s.recognizedMonths!);
      totals.set(input.personal.relationshipProvince, (totals.get(input.personal.relationshipProvince) ?? 0) + f);
      let province = input.personal.householdProvince, sources = pr.branchSourceIds.householdRelationship, branch = '关系在户籍省';
      if (input.personal.relationshipProvince !== input.personal.householdProvince) {
        if ((totals.get(input.personal.relationshipProvince) ?? 0) >= pr.qualifyingMonths) { province = input.personal.relationshipProvince; sources = pr.branchSourceIds.currentTenYears; branch = '现关系省累计满10年'; }
        else {
          const previous = [...paid].reverse().find(s => (totals.get(s.province) ?? 0) >= pr.qualifyingMonths);
          if (previous) { province = previous.province; sources = pr.branchSourceIds.lastTenYears; branch = '最后一个累计满10年的原关系省'; }
          else { sources = pr.branchSourceIds.householdFallback; branch = '各省均不足10年，归集户籍省'; }
        }
      }
      if (!sources.length || sources.some(id => !pr.sourceIds.includes(id))) throw new Error('领取省分支来源缺失');
      out.benefitProvince = { province, conditional: true, explanation: `冻结2026规则且普通关系保持上述路径时：${branch}；还须达到届时领取条件。仅省级，不认定市级经办地。`, sourceIds: [...sources], scope: { ...pr.scope, population: '普通关系及未来状态已明确的固定规则省级条件推演；不是已满足待遇申领资格的认定' } };
    } catch (e) { fail((e as Error).message); }
    if (input.frozen2026Confirmed !== true) fail('尚未接受固定2026参数、零利息及退休月办妥申领的明确情景假设');
    if (input.personal.specialCase !== 'none' || input.personal.accountKind !== 'ordinary') fail('特殊身份、视同/过渡、临时账户或未知身份不开放金额');
    if ([...history, ...future].some(s => s.regime === 'flexible') && input.personal.category !== 'original-60') fail('女性灵活就业退休身份尚未核验，不能自动沿用企业原50/55类别');
    if (future.some(s => s.regime === 'flexible') && input.flexibleEligibilityConfirmed !== true) fail('须先核实符合当前上海灵活就业参保条件；未来按同条件持续仅为情景，普通养老关系不能代替准入资格');
    if (future.some(s => s.regime === 'flexible' && month(s.to) === retire)) {
      try {
        if (!projection?.flexibleRetirementMonthEvidence) throw new Error('灵活就业退休当月自愿缴费缺少专门依据');
        evidence(projection.flexibleRetirementMonthEvidence, projection.snapshotDate, projection);
        if (out.totalMonths === undefined || out.totalMonths - 1 < date.minimumContributionMonths) throw new Error('灵活就业退休当月自愿缴费情景须在前月已满最低年限；年限不足的当月规则未开放');
      } catch (e) { fail((e as Error).message); }
    }
    if (future.some(s => s.regime === 'employee' && month(s.to) === retire)) {
      try {
        if (!projection?.employeeRetirementMonthEvidence) throw new Error('单位职工退休当月缴费缺少专门依据');
        evidence(projection.employeeRetirementMonthEvidence, projection.snapshotDate, projection);
      } catch (e) { fail((e as Error).message); }
    }
    if (projection) {
      if (history.some(s => s.regime !== 'paused' && (s.province !== projection.province || month(s.from) < month(projection.earliestHistoryMonth)))) fail(`金额仅支持上海${projection.earliestHistoryMonth}起的普通实缴历史；跨省指数及更早历史未开放`);
      if (history.some(s => s.regime !== 'paused' && (s.recognizedMonths !== month(s.to) - month(s.from) + 1 || s.indexSum4 === undefined || s.indexSum4 <= 0))) fail('金额需要每个实缴段的完整认可月数及经办核定逐月四位指数之和；部分月记录请拆分');
      const early = history.filter(s => s.regime !== 'paused' && s.from < '2014-01');
      if (early.length && input.historyIndexTreatment !== 'agency-2026-adjusted') fail('2014年前历史须确认经办逐月指数和已按2026附件处理历史保底，不能用平均指数反乘');
      if (early.some(s => s.indexSum4 !== undefined && s.indexSum4 < historicalFloorSum4(month(s.from), month(s.to)))) fail('历史指数和低于1993—2011为1、2012为0.85、2013为0.75的逐月保底合计；请核对经办记录');
    }
    if (!input.account) fail('缺少个人账户余额及其截止月，不能把未知账户当0');
    else { money(input.account.balanceCents, '个人账户余额'); if (month(input.account.asOfMonth) !== cutoff) fail('账户余额截止月须为2026-09，已包含全部历史入账；避免重复或漏记'); }
    if (date.chosenAgeMonths % 12 !== 0 || date.chosenAgeMonths < 600 || date.chosenAgeMonths > 792) fail('非整岁或50—66岁之外的计发月数尚未核验，退休日期仍有效');
    if (out.benefitProvince?.province !== '上海') fail('金额只能按最终领取上海的规则计算，不能将各省养老金相加');
    if (out.totalMonths !== undefined && !out.retirement!.contributionSufficient) {
      if (!out.issues.length) out.status = 'ineligible';
      fail(`所选法定退休月累计${out.totalMonths}月，未达到${out.retirement!.minimumContributionMonths}月门槛`);
    }
    let monthly: number | undefined;
    if (!out.issues.length && projection && input.account && out.totalMonths !== undefined && futureValid) {
      const total = out.totalMonths, sumLower = indexSum4 + futureIndexLower4, sumUpper = indexSum4 + futureIndexUpper4;
      if (total <= 0) throw new Error('缴费月数必须大于0');
      const divisor = projection.accountDivisors[date.chosenAgeMonths / 12];
      integer(divisor, 1, 1000, '核定整岁计发月数');
      const finalAccount = input.account.balanceCents + accountAdded; money(finalAccount, '情景退休账户余额');
      // Keep the prescribed four-decimal Y independent of I: cancelling Y=M/12 would silently omit its rounding.
      const yearNumerator = BigInt(total) * BigInt(10000);
      const yearLower4 = yearNumerator / BigInt(12), yearUpper4 = (yearNumerator + BigInt(11)) / BigInt(12);
      const basicAt = (sum4: number, year4: bigint) => ceilJiao(BigInt(projection.pensionBaseCents) * (BigInt(total) * BigInt(10000) + BigInt(sum4)) * year4,
        BigInt(2) * BigInt(total) * BigInt(10000) * BigInt(10000) * BigInt(100));
      const basic = basicAt(sumLower, yearLower4), basicUpper = basicAt(sumUpper, yearUpper4);
      const account = ceilJiao(BigInt(finalAccount), BigInt(divisor));
      out.roundingDiagnostic = { basicMinimumCents: basic, basicMaximumCents: basicUpper,
        monthlyMinimumCents: basic + account, monthlyMaximumCents: basicUpper + account,
        explanation: `月指数和四位单位区间[${sumLower},${sumUpper}]，缴费年限四位单位区间[${yearLower4},${yearUpper4}]；分别代入官方公式并分项见分进角。这是四位取舍敏感性界限，不是法定舍入方式或模拟核定值。`,
        sourceIds: [...projection.sourceIds], scope: { ...projection.scope } };
      if (basic !== basicUpper) { fail('四位取舍会影响最终金额；仅显示敏感性区间，不能确定单一养老金'); }
      else monthly = basic + account;
      const futurePersonal = [...projectedPoints.values()].reduce((sum, p) => sum + p.personal, 0);
      const futureEmployer = [...projectedPoints.values()].reduce((sum, p) => sum + p.employer, 0);
      if (monthly !== undefined) out.lines = [
        line('planner-future-personal-paid', '未来个人养老现金投入合计', futurePersonal, '各未来月个人养老现金相加；职工个人份额、灵活就业本人全额20%，不把现金总额当账户入账', projection),
        line('planner-future-employer-paid', '未来单位养老现金投入合计', futureEmployer, '各未来月单位养老缴费相加；灵活就业单位额为0，明确停缴月为0', projection),
        line('planner-future-account', '未来账户入账情景', accountAdded, '未来各月养老基数×账户记账比例相加；零未来利息，历史余额不重复加入', projection),
        line('planner-retirement-account', '退休时账户余额情景', finalAccount, `历史截止余额${input.account.balanceCents}分＋未来入账${accountAdded}分；未来利息0`, projection),
        line('planner-pension-basic', '基础养老金固定规则情景/月', basic, `${projection.pensionBaseCents}分×(1＋Q/(${total}×10000))÷2×Y×1%；Q∈[${sumLower},${sumUpper}]，Y∈[${yearLower4}/10000,${yearUpper4}/10000]；上下端分别见分进角同值`, projection),
        line('planner-pension-account', '账户养老金固定规则情景/月', account, `${finalAccount}分÷${divisor}计发月数；分别见分进角`, projection),
        line('planner-pension-monthly', '月养老金固定2026规则情景', monthly, `${basic}分＋${account}分；实际退休年为${date.chosenRetirementMonth.slice(0,4)}，并非当年待遇预测`, projection),
        line('planner-payout-window', '观察窗口累计领取情景', monthly * input.payoutYears * 12, `${monthly}分×${input.payoutYears}×12；退休月办妥申领假设，待遇不调整；窗口不是法定截止`, projection),
      ];
      if (monthly !== undefined) out.status = 'supported';
    }
    // Graph uses one calendar axis. Missing recorded history remains null and flips completeness.
    const graphEvidence = projection ?? rules.retirement;
    const start = history.length ? month(history[0].from) : cutoff + 1;
    let cp = 0, ce = 0, cr = 0, pc = true, ec = true;
    for (let m = start; includePoints && m <= retire + input.payoutYears * 12; m++) {
      const phase = m <= cutoff ? 'history' : m <= retire ? 'future' : 'payout';
      const cash = phase === 'history' ? historyPoints.get(m) : phase === 'future' ? projectedPoints.get(m) : { personal: 0, employer: 0 };
      const p = cash?.personal ?? null, e = cash?.employer ?? null;
      if (p === null) pc = false; else cp += p;
      if (e === null) ec = false; else ce += e;
      const pension = phase === 'payout' ? monthly ?? null : 0;
      if (pension !== null) cr += pension;
      out.points.push({ month: ym(m), phase, personalCents: p, employerCents: e, pensionCents: pension,
        cumulativePersonalCents: cp, cumulativeEmployerCents: ce, cumulativePensionCents: phase === 'payout' && monthly === undefined ? null : cr,
        personalCumulativeComplete: pc, employerCumulativeComplete: ec, sourceIds: [...graphEvidence.sourceIds], scope: { ...graphEvidence.scope },
        formula: phase === 'history' ? '已录历史养老实缴月额；缺失为未知，累计仅加已录部分' : phase === 'future' ? '冻结基数×养老比例；灵活就业个人全额与账户入账分开；明确停缴为0' : '假设退休月办妥申领后次月开始，固定月额逐月相加；观察期不是法定截止',
      });
    }
  } catch (e) { out.status = 'unsupported'; fail(e instanceof Error ? e.message : '规划资料无效'); }
  return out;
}

/** Search the published scenario domain without mutating history; exact feasibility and minimum certainty remain separate. */
export function solvePensionPlanTarget(input: PensionPlannerInverseInput, rules: PensionPlannerRules): PensionPlannerInverseResult {
  const out: PensionPlannerInverseResult = { status: 'unsupported', candidates: [], evaluatedCandidates: 0, issues: [], warnings: [
    '目标为至少达到；仅搜索冻结规则所列基数域和指定月份。四位取舍敏感性不能当作无解或擅自选择舍入。',
    '只替换未来计划；历史、余额截止月、出生信息、原退休类别和领取地区不变。未选变量以外的约束保持固定。',
  ] };
  try {
    const rule = rules.projection; if (!rule) throw new Error('缺少已核验正向规划规则，不能倒推');
    checkedRule(rule, input.plan.snapshotMonth);
    money(input.targetMonthlyCents, '目标月养老金'); money(input.maximumPersonalMonthlyCents, '月投入上限');
    const from = month(input.futureFrom), to = month(input.futureTo);
    if (from < month(input.plan.snapshotMonth) || to < from || to - from > 720) throw new Error('未来搜索窗口无效');
    if (input.regime !== 'employee' && input.regime !== 'flexible') throw new Error('未来制度未支持');
    if (input.variable !== 'base' && input.variable !== 'months') throw new Error('请选择固定窗口求基数或固定基数求月数');
    const retirement = calculateRetirement({ birthMonth: input.plan.personal.birthMonth, category: input.plan.personal.category, contributionMonths: 0, choice: 'statutory' }, rules.retirement);
    if (!retirement.ok) throw new Error(retirement.errors.join('；'));
    if (to > month(retirement.chosenRetirementMonth)) throw new Error('搜索窗口不能晚于法定退休月；不擅自延后退休');
    if (rule.futureBaseDomain === 'whole-yuan-range' && input.variable === 'base') return solveWholeYuanBase(input, rules, rule, from, to, out);
    const bases = input.variable === 'months' ? [input.fixedBaseCents] : [...rule.futureBaseOptionsCents].sort((a,b) => a-b);
    for (const base of bases) futureCash(base, input.regime, rule);
    if (input.plan.history.some(s => s.recognizedMonths === undefined)) throw new Error('历史认可月数未知，不能以0替代倒推');
    let unsupported: string[] = [], considered = 0, budgetExcluded = 0;
    let best: PensionPlannerCandidate | undefined;
    for (const base of bases) {
      const cash = futureCash(base, input.regime, rule);
      const counts = input.variable === 'months' ? Array.from({length:to-from+2}, (_,i) => i) : [to-from+1];
      for (const count of counts) {
        considered++;
        const future: PensionPlannerFuture[] = count === 0 ? [] : [{ id: 'inverse-future', from: input.futureFrom, to: ym(from+count-1), province: rule.province, regime: input.regime, baseCents: base }];
        const forward = calculatePensionPlanInternal({ ...input.plan, future, unlistedFutureMonths: 'paused' }, rules, false);
        out.evaluatedCandidates++;
        if (forward.roundingDiagnostic && (count === 0 || cash.personal <= input.maximumPersonalMonthlyCents)) {
          const d = forward.roundingDiagnostic, previous = out.attainableMaximumRange;
          out.attainableMaximumRange = { minimumCents: Math.max(previous?.minimumCents ?? 0, d.monthlyMinimumCents),
            maximumCents: Math.max(previous?.maximumCents ?? 0, d.monthlyMaximumCents), sourceIds: [...rule.sourceIds], scope: { ...rule.scope } };
        }
        if (forward.roundingDiagnostic && forward.status === 'unsupported') {
          if (forward.roundingDiagnostic.monthlyMaximumCents < input.targetMonthlyCents || (count > 0 && cash.personal > input.maximumPersonalMonthlyCents)) continue;
          out.sensitiveCandidates ??= [];
          out.sensitiveCandidates.push({ baseCents: base, months: count,
            minimumMonthlyCents: forward.roundingDiagnostic.monthlyMinimumCents, maximumMonthlyCents: forward.roundingDiagnostic.monthlyMaximumCents,
            targetRelation: forward.roundingDiagnostic.monthlyMinimumCents >= input.targetMonthlyCents ? 'lower-bound-meets' : 'overlaps',
            sourceIds: [...rule.sourceIds], scope: { ...rule.scope } });
          continue;
        }
        if (forward.status === 'unsupported') { unsupported = [...new Set([...unsupported, ...forward.issues])]; continue; }
        if (forward.status === 'ineligible') continue;
        if (count > 0 && cash.personal > input.maximumPersonalMonthlyCents) { budgetExcluded++; continue; }
        const pension = forward.lines.find(l => l.id === 'planner-pension-monthly')!;
        const candidate: PensionPlannerCandidate = { from: input.futureFrom, to: count === 0 ? input.futureFrom : ym(from+count-1), baseCents: base, months: count,
          personalMonthlyCents: count === 0 ? 0 : cash.personal, personalTotalCents: cash.personal*count, monthlyPensionCents: pension.amountCents,
          future, sourceIds: [...rule.sourceIds], scope: { ...rule.scope }, lines: [
            line('planner-candidate-monthly-paid', '未来个人养老月投入', count === 0 ? 0 : cash.personal, count === 0 ? '未来明确停缴，个人投入为0；仍等待法定到龄并满足申领条件' : `${base}分×${input.regime === 'employee' ? rule.employeePersonalRateBps : rule.flexiblePersonalRateBps}/10000`, rule),
            line('planner-candidate-total-paid', '未来个人养老累计投入', cash.personal*count, `${cash.personal}分×${count}个月；其余未来月明确停缴`, rule), pension,
          ] };
        if (!best || candidate.monthlyPensionCents > best.monthlyPensionCents) best = candidate;
        if (pension.amountCents >= input.targetMonthlyCents) out.candidates.push(candidate);
      }
    }
    if (!considered) throw new Error('搜索域为空，不能判断无解');
    if (unsupported.length) { out.issues = unsupported; out.candidates = []; return out; }
    if (best && out.attainableMaximumRange?.minimumCents === out.attainableMaximumRange?.maximumCents && best.monthlyPensionCents === out.attainableMaximumRange?.maximumCents) {
      out.bestCandidate = best; out.attainableMaximumMonthlyCents = best.monthlyPensionCents;
    }
    if (input.variable === 'months') {
      const firstExact = out.candidates.length ? Math.min(...out.candidates.map(c => c.months)) : undefined;
      const sensitive = out.sensitiveCandidates ?? [];
      const possibleCounts = [...out.candidates.map(c => c.months), ...sensitive.map(c => c.months)];
      const lowerBoundCounts = [...out.candidates.map(c => c.months), ...sensitive.filter(c => c.targetRelation === 'lower-bound-meets').map(c => c.months)];
      const possibleMinimumMonths = possibleCounts.length ? Math.min(...possibleCounts) : undefined;
      const lowerBoundMinimumMonths = lowerBoundCounts.length ? Math.min(...lowerBoundCounts) : undefined;
      out.monthSearch = { possibleMinimumMonths, lowerBoundMinimumMonths, minimumExactMonths: firstExact,
        thresholdStatus: possibleMinimumMonths === undefined ? 'unreachable' : possibleMinimumMonths === lowerBoundMinimumMonths ? 'determined' : 'rounding-sensitive',
        explanation: possibleMinimumMonths === undefined ? '固定基数、月份窗口及预算内没有候选的冻结公式上界达到目标。'
          : possibleMinimumMonths === firstExact ? `最短达标月份已确定为${firstExact}月，且该方案月额唯一；较晚敏感候选不改变这一最短结果。`
          : possibleMinimumMonths === lowerBoundMinimumMonths ? `最短达标月份已确定为${possibleMinimumMonths}月，但该点月额仍有取舍区间，暂不生成单一金额采用卡。`
          : '更短候选的取舍区间与目标交叠，最短月份尚不能确定。',
        sourceIds: [...rule.sourceIds], scope: { ...rule.scope } };
      if (possibleMinimumMonths !== undefined && (firstExact === undefined || possibleMinimumMonths < firstExact)) {
        out.minimumStatus = possibleMinimumMonths === lowerBoundMinimumMonths ? 'threshold-only' : 'uncertain';
        out.issues.push(out.monthSearch.explanation);
        if (out.candidates.length) out.status = 'feasible';
        return out;
      }
      if (firstExact !== undefined) out.minimumStatus = 'exact-candidate';
      if (sensitive.length) out.warnings.push('已保留确定最短方案；另外的敏感候选仅旁列区间，不生成单一金额采用卡。');
    }
    if (input.variable === 'base' && out.sensitiveCandidates?.length) {
      const exactMinimum = out.candidates.length ? Math.min(...out.candidates.map(c => c.baseCents)) : undefined;
      if (exactMinimum === undefined || out.sensitiveCandidates.some(c => c.baseCents < exactMinimum)) {
        out.minimumStatus = 'uncertain';
        out.issues.push('较低基数仍有取舍敏感性；已知精确可行方案可以采用，但不能称为最低方案。');
        if (out.candidates.length) out.status = 'feasible';
        return out;
      }
    }
    out.constraints = [
      `未来搜索窗口固定为${input.futureFrom}—${input.futureTo}，不晚于法定退休月${retirement.chosenRetirementMonth}。`,
      `本次搜索基数${bases.map(b => `${b / 100}元`).join('、')}，逐月候选均检验四位取舍上下界；不是全部退休方式。`,
      budgetExcluded ? `${budgetExcluded}个已满足其他条件的候选被个人月预算${input.maximumPersonalMonthlyCents / 100}元排除。` : '当前月预算未排除任何满足其他条件的候选；继续增加预算不会扩大本次已覆盖档位。',
    ];
    out.candidates.sort((a,b) => a.personalTotalCents-b.personalTotalCents || a.months-b.months || a.baseCents-b.baseCents);
    out.status = out.candidates.length > 1 ? 'multiple' : out.candidates.length ? 'unique' : 'infeasible';
    if (!out.candidates.length) out.issues.push('所选离散档位、期限、月预算及法定退休条件内未达到目标；不会调整历史或延后退休。');
  } catch (e) { out.candidates = []; out.issues.push(e instanceof Error ? e.message : '逆算无法判断'); }
  return out;
}

/** Monotone endpoint search, O(log(range)) forward evaluations; no chart allocation per candidate. */
function solveWholeYuanBase(input: PensionPlannerInverseInput, rules: PensionPlannerRules, rule: PensionPlannerRule,
  from: number, to: number, out: PensionPlannerInverseResult): PensionPlannerInverseResult {
  const minimum = Math.ceil(rule.minimumBaseCents / 100), statutoryMaximum = Math.floor(rule.maximumBaseCents / 100);
  const count = to - from + 1, rate = input.regime === 'employee' ? rule.employeePersonalRateBps : rule.flexiblePersonalRateBps;
  const maximum = Math.min(statutoryMaximum, Math.floor(input.maximumPersonalMonthlyCents * 100 / rate));
  const cache = new Map<number, PensionPlanResult>();
  const futureAt = (yuan: number): PensionPlannerFuture[] => [{ id: 'inverse-future', from: input.futureFrom, to: input.futureTo, province: rule.province, regime: input.regime, baseCents: yuan * 100 }];
  const at = (yuan: number): PensionPlanResult => {
    if (!cache.has(yuan)) {
      const result = calculatePensionPlanInternal({ ...input.plan, future: futureAt(yuan), unlistedFutureMonths: 'paused' }, rules, false);
      cache.set(yuan, result); out.evaluatedCandidates++;
      if (result.status === 'unsupported' && !result.roundingDiagnostic) throw new Error(result.issues.join('；'));
    }
    return cache.get(yuan)!;
  };
  const first = at(minimum); // Validate missing history/eligibility even when the budget excludes the whole range.
  out.constraints = [`未来窗口${input.futureFrom}—${input.futureTo}固定，不更改历史或退休日期。`,
    `基数搜索冻结上下限内每一整数元：${minimum}—${statutoryMaximum}元；用单调二分计算门槛，未生成逐基数曲线。`,
    '四位取舍区间仅作敏感性诊断；候选卡列精确最低达标边界、可精确计算的预算上边界及符合本次约束的已达标当前计划，不是全部方案清单。'];
  if (first.status === 'ineligible' || maximum < minimum) {
    out.status = 'infeasible'; out.issues.push(first.status === 'ineligible' ? '固定缴费窗口不足法定最低年限；提高基数不能补足月份' : '个人月预算低于冻结最低基数的养老投入'); return out;
  }
  const maxResult = at(maximum), maxRange = maxResult.roundingDiagnostic!;
  out.attainableMaximumRange = { minimumCents: maxRange.monthlyMinimumCents, maximumCents: maxRange.monthlyMaximumCents,
    sourceIds: [...rule.sourceIds], scope: { ...rule.scope } };
  if (maxRange.monthlyMinimumCents === maxRange.monthlyMaximumCents) out.attainableMaximumMonthlyCents = maxRange.monthlyMaximumCents;
  const lower = (yuan: number) => at(yuan).roundingDiagnostic!.monthlyMinimumCents;
  const upper = (yuan: number) => at(yuan).roundingDiagnostic!.monthlyMaximumCents;
  const threshold = (value: (yuan: number) => number): number | undefined => {
    if (value(maximum) < input.targetMonthlyCents) return undefined;
    let lo = minimum, hi = maximum;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (value(mid) >= input.targetMonthlyCents) hi = mid; else lo = mid + 1; }
    return lo;
  };
  const possible = threshold(upper), lowerBound = threshold(lower);
  out.rangeSearch = { possibleMinimumBaseCents: possible === undefined ? undefined : possible * 100,
    lowerBoundMinimumBaseCents: lowerBound === undefined ? undefined : lowerBound * 100,
    maximumWithinBudgetBaseCents: maximum * 100, maximumMonthlyMinimumCents: maxRange.monthlyMinimumCents,
    maximumMonthlyMaximumCents: maxRange.monthlyMaximumCents,
    thresholdStatus: possible === undefined ? 'unreachable' : possible === lowerBound ? 'determined' : 'rounding-sensitive',
    explanation: possible === undefined ? '预算内最高基数的冻结公式上界仍未达到目标。' : possible === lowerBound
      ? `最低达标基数已确定为${possible}元：该点下界达标，前一整数元上界不达标或已低于法定基数下限。月待遇仍须单独检验取舍敏感性，门槛确定不代表月额唯一。`
      : '可能达标门槛按冻结公式上界求得，下界达标门槛按下界求得；两者之间不能判定。范围不是单一养老金或法定舍入结论。',
    sourceIds: [...rule.sourceIds], scope: { ...rule.scope } };
  if (possible === undefined) { out.status = 'infeasible'; out.issues.push('预算和固定窗口内最高基数的养老金上界仍低于目标'); return out; }
  const makeCandidate = (yuan: number): PensionPlannerCandidate => {
    const base = yuan * 100, cash = futureCash(base, input.regime, rule), result = at(yuan);
    const pension = result.lines.find(l => l.id === 'planner-pension-monthly')!;
    return { from: input.futureFrom, to: input.futureTo, baseCents: base, months: count,
      personalMonthlyCents: cash.personal, personalTotalCents: cash.personal * count, monthlyPensionCents: pension.amountCents,
      future: futureAt(yuan), sourceIds: [...rule.sourceIds], scope: { ...rule.scope }, lines: [
        line('planner-candidate-monthly-paid', '未来个人养老月投入', cash.personal, `${base}分×${rate}/10000`, rule),
        line('planner-candidate-total-paid', '未来个人养老累计投入', cash.personal * count, `${cash.personal}分×${count}个月`, rule), pension,
      ] };
  };
  const exactMinimum = possible === lowerBound && lowerBound !== undefined && at(lowerBound).status === 'supported';
  out.minimumStatus = exactMinimum ? 'exact-candidate' : possible === lowerBound ? 'threshold-only' : 'uncertain';
  if (exactMinimum) out.candidates.push(makeCandidate(lowerBound!));
  if (maxResult.status === 'supported') {
    out.bestCandidate = makeCandidate(maximum);
    if (!out.candidates.some(c => c.baseCents === maximum * 100)) out.candidates.push(out.bestCandidate);
  }
  // Recheck the actual existing plan, not a rewritten approximation of its dates or budget.
  const existing = input.plan.future.length === 1 ? input.plan.future[0] : undefined;
  if (existing && existing.from === input.futureFrom && existing.to === input.futureTo &&
    existing.province === rule.province && existing.regime === input.regime &&
    existing.baseCents !== undefined && Number.isSafeInteger(existing.baseCents) && existing.baseCents % 100 === 0 &&
    existing.baseCents >= minimum * 100 && existing.baseCents <= maximum * 100) {
    const original = calculatePensionPlanInternal(input.plan, rules, false);
    out.evaluatedCandidates++;
    const pension = original.lines.find(l => l.id === 'planner-pension-monthly');
    if (original.status === 'supported' && pension && pension.amountCents >= input.targetMonthlyCents) {
      cache.set(existing.baseCents / 100, original);
      const duplicate = out.candidates.find(c => c.baseCents === existing.baseCents);
      if (duplicate) duplicate.matchesExistingPlan = true;
      else out.candidates.push({ ...makeCandidate(existing.baseCents / 100), matchesExistingPlan: true,
        future: input.plan.future.map(segment => ({ ...segment })) });
    }
  }
  out.candidates.sort((a, b) => a.personalTotalCents - b.personalTotalCents || a.baseCents - b.baseCents);
  if (!exactMinimum) {
    out.issues.push(possible === lowerBound
      ? '最低达标基数已确定，但该点月养老金仍有取舍区间；已知精确可行的较高基数方案可单独采用。'
      : '四位取舍影响最低达标基数的判断；已知精确可行方案可以采用，但不能称为最低方案。');
    out.status = out.candidates.length ? 'feasible' : 'unsupported';
  } else out.status = lowerBound === maximum ? 'unique' : 'multiple';
  return out;
}
export interface PensionPlannerInverseResult {
  status: 'unique' | 'multiple' | 'feasible' | 'infeasible' | 'unsupported';
  /** Feasibility of an exact candidate and certainty of the minimum are independent. */
  minimumStatus?: 'exact-candidate' | 'threshold-only' | 'uncertain';
  candidates: PensionPlannerCandidate[]; issues: string[]; warnings: string[];
  evaluatedCandidates: number;
  attainableMaximumMonthlyCents?: number;
  attainableMaximumRange?: Evidence & { minimumCents: number; maximumCents: number };
  bestCandidate?: PensionPlannerCandidate;
  constraints?: string[];
  sensitiveCandidates?: Array<Evidence & { baseCents: number; months: number; minimumMonthlyCents: number;
    maximumMonthlyCents: number; targetRelation: 'lower-bound-meets' | 'overlaps' }>;
  rangeSearch?: Evidence & {
    possibleMinimumBaseCents?: number; lowerBoundMinimumBaseCents?: number;
    maximumWithinBudgetBaseCents: number; maximumMonthlyMinimumCents: number; maximumMonthlyMaximumCents: number;
    thresholdStatus: 'determined' | 'rounding-sensitive' | 'unreachable';
    explanation: string;
  };
  monthSearch?: Evidence & {
    possibleMinimumMonths?: number; lowerBoundMinimumMonths?: number; minimumExactMonths?: number;
    thresholdStatus: 'determined' | 'rounding-sensitive' | 'unreachable'; explanation: string;
  };
}
