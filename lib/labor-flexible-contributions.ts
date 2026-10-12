import type { CalculationResult, Evidence, Month, ResultLine } from './labor-engine';

export type FlexibleInsurance = 'pension' | 'unemployment' | 'medical';
export type EnrollmentState = 'enrolled' | 'not-enrolled' | 'unknown';
export interface FlexibleContributionRule extends Evidence {
  id: string;
  supportedChannels: string[];
  minimumBaseYuan: number;
  maximumBaseYuan: number;
  pensionRateBps: number;
  unemploymentRateBps: number;
  medicalFixedCents: number;
  itemSourceIds: Record<FlexibleInsurance, string[]>;
}
export interface FlexibleContributionInput {
  month: Month;
  channel: string;
  populationAndEnrollmentConfirmed: boolean;
  specialCase: 'none' | 'backpayment-or-adjustment' | 'subsidy-or-exemption' | 'other' | 'unknown';
  enrollment: Record<FlexibleInsurance, EnrollmentState>;
  /** One shared, agency-confirmed integer-yuan base, read only for pension/unemployment. */
  confirmedBaseYuan?: number;
}
const INSURANCES: FlexibleInsurance[] = ['pension', 'unemployment', 'medical'];
const LABELS: Record<FlexibleInsurance, string> = { pension: '养老保险', unemployment: '失业保险', medical: '医疗保险' };
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function integer(value: number | undefined, minimum: number, maximum: number, label: string): asserts value is number {
  if (value === undefined || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label}须为已支持范围内的明确整数，不自动补零、夹取或舍入`);
}
/** Cash outlay for a verified enrollment combination, not enrollment advice or benefit entitlement. */
export function calculateFlexibleContributions(input: FlexibleContributionInput, rule?: FlexibleContributionRule): CalculationResult {
  try {
    if (!rule || !rule.id?.trim() || !rule.sourceIds.length || rule.sourceIds.some((id) => !id.trim()) || !rule.scope.region?.trim() || !rule.scope.population?.trim()) throw new Error('缺少已核验的限定渠道个人缴费规则、适用范围或官方来源');
    if (![rule.scope.validFrom, rule.scope.validTo, rule.scope.verifiedOn].every(validDate) || rule.scope.validFrom > rule.scope.validTo) throw new Error('限定渠道缴费规则的有效期或核验日期无效');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error('请输入有效缴费月份 YYYY-MM');
    const lastDay = new Date(Date.UTC(Number(input.month.slice(0, 4)), Number(input.month.slice(5)), 0)).getUTCDate();
    if (`${input.month}-01` < rule.scope.validFrom || `${input.month}-${lastDay}` > rule.scope.validTo) throw new Error('所选月份不在已核验完整月份内；本工具不自动延用限定渠道金额');
    if (!rule.supportedChannels.length || rule.supportedChannels.some((channel) => !channel.trim()) || !rule.supportedChannels.includes(input.channel)) throw new Error('参保渠道不在所选通知规定范围内；不能把所有灵活就业或居民身份套入此模型');
    if (input.populationAndEnrollmentConfirmed !== true) throw new Error('请先确认属于通知规定渠道及人群，且三个险种的实际参保状态已由经办核定');
    if (input.specialCase !== 'none') throw new Error('补缴、补退调整、补贴减免或其他特殊及未知情形暂不计算；只复核普通当月已核定参保组合');
    if (!input.enrollment || INSURANCES.some((insurance) => !['enrolled', 'not-enrolled'].includes(input.enrollment[insurance]))) throw new Error('各险种状态必须明确为已参加或未参加；未知不能按未参加或零费用处理');
    const selected = INSURANCES.filter((insurance) => input.enrollment[insurance] === 'enrolled');
    if (!selected.length) throw new Error('请至少选择一项经办已核定实际参加的险种；全未参加不输出零元权益或缴费结论');
    let base: number | undefined;
    if (selected.some((insurance) => insurance !== 'medical')) {
      integer(rule.minimumBaseYuan, 0, 1_000_000_000, '规则基数下限');
      integer(rule.maximumBaseYuan, rule.minimumBaseYuan, 1_000_000_000, '规则基数上限');
      const confirmedBase = input.confirmedBaseYuan;
      integer(confirmedBase, rule.minimumBaseYuan, rule.maximumBaseYuan, '养老/失业共用的经办核定整数元基数');
      base = confirmedBase;
    }
    const rows: ResultLine[] = [];
    for (const insurance of selected) {
      const sourceIds = rule.itemSourceIds[insurance];
      if (!sourceIds?.length || sourceIds.some((id) => !id.trim() || !rule.sourceIds.includes(id))) throw new Error(`${LABELS[insurance]}缺少完整、可解析到所选规则的官方依据`);
      let amountCents: number;
      let formula: string;
      if (insurance === 'medical') {
        integer(rule.medicalFixedCents, 0, 100_000_000_000, '规定人群医保月固定额');
        amountCents = rule.medicalFixedCents;
        formula = `规定渠道、人群的已核定医保月固定额 ${amountCents} 分；不按养老/失业基数乘算`;
      } else {
        const rate = insurance === 'pension' ? rule.pensionRateBps : rule.unemploymentRateBps;
        integer(rate, 0, 10000, `${LABELS[insurance]}费率`);
        const numerator = BigInt(base!) * BigInt(100) * BigInt(rate);
        const denominator = BigInt(10000);
        if (numerator % denominator !== BigInt(0)) throw new Error(`${LABELS[insurance]}计算产生分以下尾差，缺少已核验舍入口径，拒绝猜测`);
        amountCents = Number(numerator / denominator);
        formula = `养老/失业共用经办核定基数 ${base} 元 × ${rate}/10000 = ${amountCents} 分；结果恰好到分，不进行地方尾差舍入`;
      }
      if (!Number.isSafeInteger(amountCents)) throw new Error('所选缴费金额超出精确整数分范围');
      rows.push({ id: `flexible-${insurance}`, label: `已参加${LABELS[insurance]}的当月个人缴费`, amountCents, formula, sourceIds: [...sourceIds], scope: { ...rule.scope } });
    }
    const total = rows.reduce((sum, row) => sum + row.amountCents, 0);
    if (!Number.isSafeInteger(total)) throw new Error('所选缴费小计超出精确整数分范围');
    rows.push({
      id: 'flexible-selected-total', label: '所选已参保险种月现金支出小计', amountCents: total,
      formula: `${selected.map((insurance) => LABELS[insurance]).join(' + ')}的上述月缴费金额相加；未参加项目未列入，不将其解释为零元权益`,
      sourceIds: [...new Set(rows.flatMap((row) => row.sourceIds))], scope: { ...rule.scope },
    });
    return { ok: true, lines: rows, warnings: [
      '选择项表示已经经办核定的实际参保组合，不表示可自行退出或任意选择法定参保义务；未知状态必须先核实。',
      '仅为所列渠道、人群和月份的已选缴费现金支出复核，不是全部灵活就业五险一金，不认定参保资格、报销待遇或退休权益。',
      '养老/失业使用同一个已核定整数元基数；该输入精度是本版支持子集，不代表法规禁止其他精度，也不把当月收入自动当作缴费基数。',
      '缴费支出不等于养老个人账户入账，不自动累积法定缴费年限；不推算补贴后净自付、补缴或补退差额。',
    ] };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : '限定渠道个人缴费计算失败'] };
  }
}
