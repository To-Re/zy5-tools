import type { CalculationResult, Evidence, Month, ResultLine } from './labor-engine';

/** A separately audited housing-fund item; never a complete payroll/contribution package. */
export interface HousingFundRule extends Evidence {
  id: string;
  regime: 'employee' | 'flexible';
  minimumBaseCents: number;
  maximumBaseCents: number;
  /** Supported input precision; this does not imply a statutory base-rounding rule. */
  baseStepCents: number;
  /** Employee: each party's equal rate. Flexible: the total self-funded rate. */
  minimumRateBps: number;
  maximumRateBps: number;
  rateStepBps: number;
  precisionNote: string;
  calculation: 'employee-equal-share' | 'flexible-half-rounded';
}
export type HousingFundSpecialCase = 'none' | 'government-or-public-institution' | 'reduced-or-deferred' | 'personal-reduced-or-exempt' | 'adjustment-or-refund' | 'special-center' | 'other' | 'unknown';
export interface HousingFundInput {
  month: Month;
  confirmedBaseCents: number;
  confirmedRateBps: number;
  populationAndParametersConfirmed: boolean;
  specialCase: HousingFundSpecialCase;
  /** Required only for flexible employment; employee calculations never read this field. */
  hasOutstandingHousingFundLoan?: boolean;
}
const MAX_MONEY_CENTS = 100_000_000_000;
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function safeInteger(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label}超出已支持范围或精度`);
}
function resultLine(id: string, label: string, amountCents: number, formula: string, rule: HousingFundRule): ResultLine {
  if (!Number.isSafeInteger(amountCents)) throw new Error('公积金结果超出安全整数分范围');
  return { id, label, amountCents, formula, sourceIds: [...rule.sourceIds], scope: { ...rule.scope } };
}
/** Round a positive rational yuan amount half-up to whole yuan, returning integer cents. */
function roundedYuanCents(numerator: bigint, denominator: bigint): number {
  const wholeYuan = (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
  const cents = Number(wholeYuan * BigInt(100));
  if (!Number.isSafeInteger(cents)) throw new Error('公积金金额超出安全整数分范围');
  return cents;
}
export function calculateHousingFund(input: HousingFundInput, rule?: HousingFundRule): CalculationResult {
  try {
    if (!rule || !rule.id?.trim() || !rule.sourceIds.length || rule.sourceIds.some((id) => !id.trim()) || !rule.scope.region?.trim() || !rule.scope.population?.trim() || !rule.precisionNote?.trim()) throw new Error('该地区、人群的公积金规则、精度范围或官方来源尚未完整核验');
    if (![rule.scope.validFrom, rule.scope.validTo, rule.scope.verifiedOn].every(validDate) || rule.scope.validFrom > rule.scope.validTo) throw new Error('公积金规则有效期或核验日无效');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error('请输入有效缴存月份 YYYY-MM');
    const lastDayNumber = new Date(Date.UTC(Number(input.month.slice(0, 4)), Number(input.month.slice(5)), 0)).getUTCDate();
    const firstDay = `${input.month}-01`, lastDay = `${input.month}-${lastDayNumber}`;
    if (firstDay < rule.scope.validFrom || lastDay > rule.scope.validTo) throw new Error('缴存月份不在已核验完整月份内，不自动延用其他年度或月中变更规则');
    if ((rule.regime === 'employee' && rule.calculation !== 'employee-equal-share') || (rule.regime === 'flexible' && rule.calculation !== 'flexible-half-rounded') || !['employee', 'flexible'].includes(rule.regime)) throw new Error('公积金制度与计算方式不匹配，不能混算职工和灵活就业缴存');
    safeInteger(rule.minimumBaseCents, 0, MAX_MONEY_CENTS, '规则基数下限');
    safeInteger(rule.maximumBaseCents, rule.minimumBaseCents, MAX_MONEY_CENTS, '规则基数上限');
    safeInteger(rule.baseStepCents, 1, MAX_MONEY_CENTS, '基数支持精度');
    safeInteger(rule.minimumRateBps, 1, 10000, '规则比例下限');
    safeInteger(rule.maximumRateBps, rule.minimumRateBps, 10000, '规则比例上限');
    safeInteger(rule.rateStepBps, 1, 10000, '比例支持精度');
    if (input.populationAndParametersConfirmed !== true) throw new Error('请先确认适用所选普通人群，基数和比例已经经办核定，且适用标准缴存方式');
    if (input.specialCase !== 'none') throw new Error('机关事业、降缓缴、个人减缴/免缴、特殊分中心、补退差额或情况不明暂不计算；请取得适用核定金额');
    if (rule.regime === 'flexible' && input.hasOutstandingHousingFundLoan !== false) throw new Error('灵活就业首版仅支持已明确无未结清公积金贷款；有贷款或状态不明需核验历史月额约束');
    safeInteger(input.confirmedBaseCents, rule.minimumBaseCents, rule.maximumBaseCents, '经办核定基数');
    if (input.confirmedBaseCents % rule.baseStepCents !== 0) throw new Error('基数不在本版支持的已核定精度内；不自行夹取、取整或推定本月工资为基数');
    safeInteger(input.confirmedRateBps, rule.minimumRateBps, rule.maximumRateBps, '经办核定比例');
    if (input.confirmedRateBps % rule.rateStepBps !== 0) throw new Error('比例不在本版支持的已核定精度内；不自行取整或猜测比例');
    // base cents × basis points / (100 cents per yuan × 10000 basis points).
    const numerator = BigInt(input.confirmedBaseCents) * BigInt(input.confirmedRateBps);
    const denominator = BigInt(1_000_000) * BigInt(rule.regime === 'flexible' ? 2 : 1);
    const roundedShare = roundedYuanCents(numerator, denominator);
    const total = roundedShare * 2;
    if (!Number.isSafeInteger(total)) throw new Error('公积金月缴存额合计超出安全整数分范围');
    const baseText = `${input.confirmedBaseCents} 分`, rateText = `${input.confirmedRateBps}/10000`;
    const lines = rule.regime === 'employee' ? [
      resultLine('housing-fund-personal', '职工个人公积金月缴存额', roundedShare, `经办核定基数 ${baseText} × 单方比例 ${rateText}；元以下四舍五入到整元，得到 ${roundedShare} 分`, rule),
      resultLine('housing-fund-employer', '单位公积金月缴存额', roundedShare, `经办核定基数 ${baseText} × 与个人相同的单方比例 ${rateText}；独立四舍五入到整元，得到 ${roundedShare} 分`, rule),
      resultLine('housing-fund-total', '公积金月缴存合计', total, `个人整元金额 ${roundedShare} 分 + 单位整元金额 ${roundedShare} 分；不是合并未舍入金额后再取整`, rule),
    ] : [
      resultLine('housing-fund-total', '灵活就业公积金月缴存额（全部由个人承担）', total, `经办核定基数 ${baseText} × 总比例 ${rateText} ÷ 2；该半额先四舍五入到整元为 ${roundedShare} 分，再 × 2 = ${total} 分。两半均由个人承担，不是单位补缴一半`, rule),
    ];
    return { ok: true, lines, warnings: [
      rule.precisionNote,
      '本项只计算所选规则下的标准公积金月缴存额；不核定参保或缴存资格、不计算补退差额，也不是完整五险一金或全部用工成本。',
      '必须使用所选地区及年度经办核定基数和比例；不将本月税前工资直接当作基数，不对超界输入自动封顶保底。',
      '低薪个人减缴/免缴及其他特殊核定不由本公式推断；缴存额不自动等于个人所得税可扣除额。',
    ] };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : '公积金单项计算失败'] };
  }
}
