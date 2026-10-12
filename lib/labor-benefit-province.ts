import type { Evidence, Month, RuleScope } from './labor-engine';

export interface BenefitProvinceRule extends Evidence {
  id: string;
  qualifyingMonths: number;
  minimumTotalMonthsByYear: Record<number, number>;
  supportedProvinces: string[];
  /** Source IDs for the exact branch, rather than treating one citation as every rule. */
  branchSourceIds: {
    householdRelationship: string[];
    currentTenYears: string[];
    lastTenYears: string[];
    householdFallback: string[];
    temporaryAccounts: string[];
  };
}
export interface BenefitProvincePeriod {
  id: string;
  province: string;
  from: Month;
  to: Month;
  recognizedMonths: number;
  accountKind: 'ordinary' | 'temporary';
}
export interface BenefitProvinceInput {
  asOfDate: string;
  householdProvince: string;
  ordinaryRelationshipProvince: string;
  currentParticipationProvince: string;
  currentAccountKind: 'ordinary' | 'temporary' | 'unknown';
  recordsConfirmed: boolean;
  eligibilityConfirmed: boolean;
  hasSpecialCircumstances: boolean;
  temporaryHandlingConfirmed: boolean;
  periods: BenefitProvincePeriod[];
}
export interface BenefitProvinceStep {
  label: string;
  detail: string;
  sourceIds: string[];
}
export type BenefitProvinceResult = {
  ok: true;
  benefitProvince: string;
  branch: 'household-relationship' | 'current-ten-years' | 'last-ten-years' | 'household-fallback';
  explanation: string;
  steps: BenefitProvinceStep[];
  sourceIds: string[];
  scope: RuleScope;
  warnings: string[];
} | { ok: false; errors: string[]; sourceIds: string[]; scope: RuleScope };

function monthIndex(value: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('年月须为 YYYY-MM');
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1;
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function fail(message: string): never { throw new Error(message); }

/** Province only. Recognized relationship history is an input; raw payments cannot establish it. */
export function calculateBenefitProvince(input: BenefitProvinceInput, rule: BenefitProvinceRule): BenefitProvinceResult {
  try {
    if (!rule.sourceIds.length || !validDate(rule.scope.verifiedOn) || !validDate(rule.scope.validFrom) || !validDate(rule.scope.validTo)) fail('缺少已核验的完整领取地规则与来源');
    if (!validDate(input.asOfDate) || input.asOfDate < rule.scope.validFrom || input.asOfDate > rule.scope.validTo) fail('判断日期不在已核验规则覆盖期内');
    if (!Number.isSafeInteger(rule.qualifyingMonths) || rule.qualifyingMonths <= 0) fail('领取地年限阈值规则缺失');
    if (!input.recordsConfirmed || !input.eligibilityConfirmed) fail('须先核定账户性质、完整跨省关系经历、各省认可月数及已达到待遇领取条件');
    if (input.hasSpecialCircumstances) fail('视同缴费、军龄、组织调动、户籍迁移/账户转换、2010年前转移遗留、重复关系、欠缴补缴等特殊情况需经办核定，本版不自动判断');
    if (input.currentAccountKind === 'unknown') fail('当前账户性质不明，不能把参保地直接当作基本养老保险关系所在地');
    const supported = (province: string) => rule.supportedProvinces.includes(province);
    if (!supported(input.householdProvince) || !supported(input.ordinaryRelationshipProvince) || !supported(input.currentParticipationProvince)) fail('请使用本版支持的省级地区；温州市属于浙江，不能作为独立领取省份');
    if (!Array.isArray(input.periods) || !input.periods.length || input.periods.length > 100) fail('请填写1–100段完整、经核定的跨省关系经历');
    const periods = input.periods.map((period) => {
      if (!period.id.trim() || !supported(period.province)) fail('经历记录编号或省份无效');
      const from = monthIndex(period.from), to = monthIndex(period.to);
      if (from > to || to > monthIndex(input.asOfDate.slice(0, 7))) fail('经历结束年月不能早于开始年月或晚于判断日期');
      if (!Number.isSafeInteger(period.recognizedMonths) || period.recognizedMonths < 0 || period.recognizedMonths > to - from + 1) fail('本段认可月数须为非负整数且不超过起止月份数；视同等特殊年限不可填入');
      if (period.accountKind !== 'ordinary' && period.accountKind !== 'temporary') fail('每段账户性质必须由经办明确为普通关系或临时账户');
      return { ...period, fromIndex: from, toIndex: to };
    }).sort((a, b) => a.fromIndex - b.fromIndex);
    if (new Set(periods.map((period) => period.id)).size !== periods.length) fail('经历记录编号重复');
    for (let i = 1; i < periods.length; i++) {
      if (periods[i].fromIndex <= periods[i - 1].toIndex) fail('经历月份重叠；重复缴费或并存关系应先由经办清理，不自动重复计入');
    }
    const temporaryPeriods = periods.filter((period) => period.accountKind === 'temporary');
    // Temporary accounts are deliberately blocked until their attribution has a complete rule package.
    if (temporaryPeriods.length || input.currentAccountKind === 'temporary') fail('涉及临时账户：须先核定普通关系保留地与临时账户归集、年限归属；本版暂不自动给出领取省份');
    if (input.currentAccountKind !== 'ordinary') fail('当前账户类型无效');
    if (input.currentParticipationProvince !== input.ordinaryRelationshipProvince) fail('当前普通参保省与正式养老关系省不一致；未完成转移不能直接推断领取地');
    const ordinaryPeriods = periods.filter((period) => period.accountKind === 'ordinary');
    const last = ordinaryPeriods.at(-1);
    if (!last || last.province !== input.ordinaryRelationshipProvince) fail('完整经历中最后普通关系省与当前正式关系省不一致，请先核实转移记录');
    const totals = new Map<string, number>();
    const lastOrdinaryMonth = new Map<string, number>();
    for (const period of ordinaryPeriods) {
      totals.set(period.province, (totals.get(period.province) ?? 0) + period.recognizedMonths);
      lastOrdinaryMonth.set(period.province, Math.max(lastOrdinaryMonth.get(period.province) ?? -1, period.toIndex));
    }
    const minimumTotal = rule.minimumTotalMonthsByYear[Number(input.asOfDate.slice(0, 4))];
    if (!Number.isSafeInteger(minimumTotal) || minimumTotal <= 0) fail('该判断年份缺少已核验总缴费月数门槛');
    if ([...totals.values()].reduce((sum, value) => sum + value, 0) < minimumTotal) fail(`无特殊年限的已录实际月数不足${minimumTotal}月，与已达普通职工按月领取条件的确认矛盾`);
    const steps: BenefitProvinceStep[] = [{
      label: '按省归集普通关系记录',
      detail: [...totals.entries()].map(([province, months]) => `${province} ${months}个月`).join('；') + '。同省多次普通关系经历累计；不认定省内市级经办地。',
      sourceIds: [...rule.sourceIds],
    }];
    let branch: Extract<BenefitProvinceResult, { ok: true }>['branch'];
    let benefitProvince: string;
    let explanation: string;
    let branchSources: string[];
    if (input.ordinaryRelationshipProvince === input.householdProvince) {
      branch = 'household-relationship'; benefitProvince = input.householdProvince;
      explanation = '基本养老保险关系在户籍省，按该分支由户籍省办理；不要求该省单独满10年。';
      branchSources = rule.branchSourceIds.householdRelationship;
    } else if ((totals.get(input.ordinaryRelationshipProvince) ?? 0) >= rule.qualifyingMonths) {
      branch = 'current-ten-years'; benefitProvince = input.ordinaryRelationshipProvince;
      explanation = `基本养老关系不在户籍省，现基本养老关系省累计认可月数达到${rule.qualifyingMonths}个月，按该分支在现关系省办理。`;
      branchSources = rule.branchSourceIds.currentTenYears;
    } else {
      const previousQualified = [...totals.entries()].filter(([province, months]) => province !== input.ordinaryRelationshipProvince && months >= rule.qualifyingMonths).sort(([a], [b]) => lastOrdinaryMonth.get(b)! - lastOrdinaryMonth.get(a)!);
      if (previousQualified.length) {
        branch = 'last-ten-years'; benefitProvince = previousQualified[0][0];
        explanation = `现基本养老关系省不足${rule.qualifyingMonths}个月；按已核定经历顺序，退回最后一个累计满${rule.qualifyingMonths}个月的原参保省${benefitProvince}办理。`;
        branchSources = rule.branchSourceIds.lastTenYears;
      } else {
        branch = 'household-fallback'; benefitProvince = input.householdProvince;
        explanation = `现基本养老关系不在户籍省，且各原参保省累计均不足${rule.qualifyingMonths}个月，按该分支归集到户籍省办理。`;
        branchSources = rule.branchSourceIds.householdFallback;
      }
    }
    if (!branchSources?.length) fail('所用判断分支缺少官方原文来源');
    steps.push({ label: '适用领取省份分支', detail: explanation, sourceIds: [...branchSources] });
    return {
      ok: true, branch, benefitProvince, explanation, steps,
      sourceIds: [...new Set([...rule.sourceIds, ...branchSources])], scope: { ...rule.scope },
      warnings: [
        '这是基于经办已确认输入的省级规则判断，最终仍以主管部门办理核定为准；不推断市级经办地，温州统一按浙江省参与本判断。',
        '完整领取资格不是缴满某省10年；原退休年龄类别、最低总年限和退休方式必须另行核定。',
        '同省累计年限包含哪些历史月份须经办确认。本版排除视同缴费、临时账户与其他特殊归属，不把原始缴费流水等同关系记录。',
        '养老金额应按最终待遇领取地规则与归集后的核定参数计算，不将北京、上海、浙江等各省养老金分别相加。',
      ],
    };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : '领取省份判断失败'], sourceIds: [...rule.sourceIds], scope: { ...rule.scope } };
  }
}
