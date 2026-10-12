import type { CalculationResult, Evidence, ResultLine } from './labor-engine';

/** Review already approved component parameters; this is never a pension-entitlement calculator. */
export interface PensionComponentRule extends Evidence {
  id: string;
  region: 'beijing' | 'zhejiang';
  supportedYear: 2026;
  basicRateBps: 100;
  accountDivisors: Record<number, number>;
  componentSourceIds: { basic: string[]; account: string[] };
  /** Distinguish confirmed two-decimal service years from a claimed statutory Zhejiang rounding rule. */
  precisionNote: string;
  /** Separate admission for an agency-confirmed standard basic-component formula,
   * including recognized deemed service. Does not broaden account/total benefits. */
  basicReviewEvidence?: Evidence;
}
export interface PensionComponentCommonInput {
  ruleDate: string;
  parametersConfirmed: boolean;
  componentApplicableConfirmed: boolean;
  specialCase: 'none' | 'transitional-or-deemed' | 'special-population' | 'unknown';
}
export interface BasicPensionComponentInput extends PensionComponentCommonInput {
  /** Explicitly review the already approved standard B × N × 1% component only;
   * do not infer eligibility, recognize deemed service, or calculate other components. */
  basicReviewConfirmed?: boolean;
  /** Agency-approved B = (applicable pension wage C + personal indexed wage W) / 2, after its local processing. */
  confirmedCalculationWageCents: number;
  /** Agency-approved service years × 100; no conversion from payment months is performed here. */
  confirmedServiceYearsHundredths: number;
}
export interface AccountPensionComponentInput extends PensionComponentCommonInput {
  confirmedBalanceCents: number;
  confirmedRetirementAgeYears: number;
  confirmedDivisorMonths: number;
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function integer(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label}须为本版支持范围内的已核定精确值`);
}
function applicable(input: PensionComponentCommonInput, rule: PensionComponentRule | undefined, component: 'basic' | 'account', basicReview = false): Evidence {
  if (!rule || !rule.id?.trim() || !['beijing', 'zhejiang'].includes(rule.region) || rule.supportedYear !== 2026 || !rule.scope.region?.trim() || !rule.scope.population?.trim()) throw new Error('本模块仅开放已核验北京或浙江2026年规定普通人群的分项算式复核');
  const extended = basicReview && component === 'basic' ? rule.basicReviewEvidence : undefined;
  if (basicReview && !extended) throw new Error('该地区尚未准入更广人群的经办核定基础分项复核，不能沿用新人来源扩展');
  const scope = extended?.scope ?? rule.scope;
  if (!scope.region?.trim() || !scope.population?.trim() || ![scope.validFrom, scope.validTo, scope.verifiedOn].every(validDate) || scope.validFrom > scope.validTo) throw new Error('分项规则有效期、人群或核验日不完整');
  if (!validDate(input.ruleDate) || Number(input.ruleDate.slice(0, 4)) !== rule.supportedYear || input.ruleDate < scope.validFrom || input.ruleDate > scope.validTo) throw new Error('请选择已核验覆盖期内的2026年核定日期，不套用其他年度或不存在日期');
  const ids = extended?.sourceIds ?? rule.componentSourceIds[component];
  if (!rule.sourceIds.length || rule.sourceIds.some((id) => !id.trim()) || !ids?.length || ids.some((id) => !id.trim() || !rule.sourceIds.includes(id))) throw new Error('该分项缺少已核验且适用的官方公式原文');
  if (input.parametersConfirmed !== true) throw new Error('只接受经办已核定的该分项参数，包含当地中间值处理；不可用自填假设替代缺失政策参数');
  if (input.componentApplicableConfirmed !== true) throw new Error(`须先由经办确认所选地区、年度及${basicReview ? '标准基础分项' : '普通新人分项'}公式适用；本工具不判断完整退休资格`);
  if (basicReview) {
    if (input.specialCase !== 'none' && input.specialCase !== 'transitional-or-deemed') throw new Error('未知身份或特殊计发公式未准入；经办已认定视同年限及普通中人只复核标准基础分项，不计算过渡待遇');
  } else if (input.specialCase !== 'none') throw new Error('视同/过渡性、机关事业转制、军转及其他特殊或未知身份不进入本分项复核');
  return { sourceIds: [...ids], scope: { ...scope } };
}
function exactJiao(numerator: bigint, denominator: bigint): number {
  if (numerator < BigInt(0) || denominator <= BigInt(0) || numerator % (denominator * BigInt(10)) !== BigInt(0)) throw new Error('该分项的精确算术结果不能恰好到角，涉及尚未核验的尾数处理；拒绝自行四舍五入或进角');
  const cents = Number(numerator / denominator);
  if (!Number.isSafeInteger(cents)) throw new Error('分项金额超出精确整数分范围');
  return cents;
}
function success(line: ResultLine, warning: string): CalculationResult {
  return { ok: true, lines: [line], warnings: [
    '仅复核一个已核定参数算式，不是完整月养老金、退休资格认定或未来待遇估算；其他分项、补贴、调节金及最低保障均未处理。',
    '不合计、不逆算目标、不计算累计领取；某一分项可复核不表示其他待遇规则已经完整，实际以主管部门核定为准。',
    warning,
  ] };
}
export function calculateBasicPensionComponent(input: BasicPensionComponentInput, rule?: PensionComponentRule): CalculationResult {
  try {
    const basicReview = input.basicReviewConfirmed === true;
    const evidence = applicable(input, rule, 'basic', basicReview);
    if (rule!.basicRateBps !== 100 || !rule!.precisionNote?.trim()) throw new Error('基础分项公式或已核年限的产品支持精度说明不完整');
    integer(input.confirmedCalculationWageCents, 1, 100_000_000_000, '已核定基础养老金计发工资基数平均值（分）');
    if (basicReview) integer(input.confirmedServiceYearsHundredths, 0, Number.MAX_SAFE_INTEGER, '已核定年限（非负安全整数百分年，仅校验技术表示范围，不认定资格或年限）');
    else integer(input.confirmedServiceYearsHundredths, 1500, 2800, '已核定缴费年限（整数百分年，本版15.00—28.00年）');
    const numerator = BigInt(input.confirmedCalculationWageCents) * BigInt(input.confirmedServiceYearsHundredths) * BigInt(rule!.basicRateBps);
    const amountCents = exactJiao(numerator, BigInt(100) * BigInt(10000));
    const yearsInteger = BigInt(input.confirmedServiceYearsHundredths);
    const years = `${yearsInteger / BigInt(100)}.${(yearsInteger % BigInt(100)).toString().padStart(2, '0')}`;
    return success({
      id: 'pension-basic-component-review', label: '基础养老金分项算式复核（非总额）', amountCents,
      formula: `经办核定 B ${input.confirmedCalculationWageCents} 分 × 经办核定年限 ${years} 年 × 1% = ${amountCents} 分，精确到角，无尾数舍入。B是经办已处理的(C + 本人指数化月平均缴费工资W)÷2；不是C、缴费基数或指数，不再÷2或乘指数。`,
      ...evidence,
    }, basicReview
      ? `${rule!.precisionNote} 仅复核经办已核定标准基础分项B与全部年限N，可包含已认定视同年限；不自动认定这些年限，不从N推断退休资格，也不把少于15年或超过28年的算式结果当作可领取证明。N使用非负安全整数百分年，金额须精确到角且不超过安全整数分；这是技术表示范围，不是法定缴费年限上下限。不从月份、C或指数推导中间值，不计算过渡分项或总待遇。`
      : `${rule!.precisionNote} 本版仅收经办直接核定的15.00—28.00年、两位年限值；28年上限是普通新人首版产品收窄，超范围不自动调整。不从月份、C或指数自行推导中间值。`);
  } catch (error) { return { ok: false, errors: [error instanceof Error ? error.message : '基础养老金分项复核失败'] }; }
}
export function calculateAccountPensionComponent(input: AccountPensionComponentInput, rule?: PensionComponentRule): CalculationResult {
  try {
    const evidence = applicable(input, rule, 'account');
    integer(input.confirmedBalanceCents, 0, 100_000_000_000, '已核定个人账户储存额（分）');
    integer(input.confirmedRetirementAgeYears, 50, 66, '已核定整周岁退休年龄');
    integer(input.confirmedDivisorMonths, 1, 1000, '已核定个人账户养老金计发月数');
    const standardDivisor = rule!.accountDivisors[input.confirmedRetirementAgeYears];
    if (!Number.isSafeInteger(standardDivisor) || standardDivisor !== input.confirmedDivisorMonths) throw new Error('经办核定计发月数与本版已核验整岁标准表不一致或缺失；不插值、不进岁、不代猜');
    const amountCents = exactJiao(BigInt(input.confirmedBalanceCents), BigInt(input.confirmedDivisorMonths));
    return success({
      id: 'pension-account-component-review', label: '个人账户养老金分项算式复核（非总额）', amountCents,
      formula: `经办核定账户储存额 ${input.confirmedBalanceCents} 分 ÷ 经办核定计发月数 ${input.confirmedDivisorMonths}（与已核整 ${input.confirmedRetirementAgeYears} 周岁表相符）= ${amountCents} 分，精确到角，无尾数舍入。`,
      ...evidence,
    }, '年龄和计发月数均须经办核定；本入口不由年龄推断退休改革资格，非整周岁及表外情形拒算。计发月数不是养老金可领取月数或法定截止期限。');
  } catch (error) { return { ok: false, errors: [error instanceof Error ? error.message : '个人账户养老金分项复核失败'] }; }
}
