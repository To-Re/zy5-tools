import type { CalculationResult, Evidence } from './labor-engine';

/** An explicitly isolated pension contribution item, never a complete payroll package. */
export interface PensionContributionItemRule extends Evidence {
  id: string;
  regime: 'employee' | 'flexible';
  minimumBaseYuan: number;
  maximumBaseYuan: number;
  personalRatePercent: number;
  employerRatePercent: number;
}
export interface PensionContributionItemInput {
  month: string;
  confirmedBaseYuan: number;
  populationAndBaseConfirmed: boolean;
}

export function calculatePensionContributionItem(input: PensionContributionItemInput, rule?: PensionContributionItemRule): CalculationResult {
  const blocked = (message: string): CalculationResult => ({ ok: false, errors: [message] });
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!rule || !rule.sourceIds.length || ![rule.scope.verifiedOn, rule.scope.validFrom, rule.scope.validTo].every(validDate) || rule.scope.validFrom > rule.scope.validTo) return blocked('该地区、人群或月份的养老缴费单项规则尚未完整核验。');
  if (!['employee', 'flexible'].includes(rule.regime) || (rule.regime === 'flexible' && rule.employerRatePercent !== 0) || ![rule.minimumBaseYuan, rule.maximumBaseYuan].every((base) => Number.isSafeInteger(base) && base >= 0) || rule.minimumBaseYuan > rule.maximumBaseYuan) return blocked('养老缴费单项的制度或基数边界规则无效，拒绝计算。');
  if (!input.populationAndBaseConfirmed) return blocked('请先确认属于所选人群，且所填为经办核定的养老缴费基数，不是直接填写本月工资。');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) return blocked('请输入有效缴费月份。');
  const firstDay = `${input.month}-01`;
  const lastDay = `${input.month}-${new Date(Date.UTC(Number(input.month.slice(0, 4)), Number(input.month.slice(5)), 0)).getUTCDate()}`;
  if (firstDay < rule.scope.validFrom || lastDay > rule.scope.validTo) return blocked('该月份不在已核验的完整月份内；本工具不会自动延用费率或基数。');
  if (!Number.isSafeInteger(input.confirmedBaseYuan) || input.confirmedBaseYuan < rule.minimumBaseYuan || input.confirmedBaseYuan > rule.maximumBaseYuan) return blocked(`仅支持经办核定的整数元基数 ${rule.minimumBaseYuan}—${rule.maximumBaseYuan} 元；超界或小数基数不自行夹取、取整。`);
  const parts = [
    { id: 'personal', label: rule.regime === 'flexible' ? '灵活就业个人养老缴费单项' : '职工个人养老缴费单项', rate: rule.personalRatePercent },
    ...(rule.regime === 'employee' ? [{ id: 'employer', label: '单位养老缴费单项', rate: rule.employerRatePercent }] : []),
  ];
  if (parts.some((part) => !Number.isSafeInteger(part.rate) || part.rate < 0 || part.rate > 100 || !Number.isSafeInteger(input.confirmedBaseYuan * part.rate))) return blocked('费率或金额精度不满足无尾差计算条件，拒绝套用未核验的舍入。');
  return {
    ok: true,
    lines: parts.map((part) => ({
      id: `pension-contribution-${rule.id}-${part.id}`, label: part.label,
      // Integer yuan * integer percent is exactly integer cents. No rounding operation.
      amountCents: input.confirmedBaseYuan * part.rate,
      formula: `经办核定养老基数 ${input.confirmedBaseYuan} 元 × ${part.rate}%（乘积精确到分，无分以下尾差）；仅缴费单项。`,
      sourceIds: [...rule.sourceIds], scope: { ...rule.scope },
    })),
    warnings: [
      '这里只计算养老保险缴费，不是完整五险一金、全部用工成本或退休养老金；没有用缺失险种的零值补齐合计。',
      '缴费支出不等于个人账户入账，也不自动证明参保资格或增加法定缴费年限。',
      '仅支持已核定整数元基数及当前规则月份；未核验小数基数、申报工资取整和地方尾差规则。',
    ],
  };
}
