import { calculateVerifiedTakeHome, type CalculationResult, type VerifiedPayrollRule, type VerifiedTakeHomeInput } from './labor-engine.ts';

export interface FixedSalaryScenarioInput {
  month: string;
  grossCents: number;
  personalContributionCents: number;
  /** Same ordinary resident employee and employer since January, unchanged monthly pay and
   * contributions, actual contributions entirely deductible, no other deductions/exemptions
   * or special tax treatment, and all previous months fully withheld under the ordinary method. */
  scenarioConfirmed: boolean;
}

export const FIXED_SALARY_SCENARIO_CONFIRMATION = '自1月起在同一单位取得居民个人普通工资，每月工资及个人缴费完全相同；个人实扣全部依法可扣，无其他扣除、免税或特殊计税；此前各月均按普通累计法足额预扣。';

function money(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000_000) throw new Error(`${label}须为支持范围内的非负整数分`);
}

/** A fixed-input illustration, not reconstruction or prediction of an actual payslip.
 * Only tax rules are extended back to January; no current contribution rates are backfilled. */
export function calculateFixedSalaryScenario(input: FixedSalaryScenarioInput, rule: VerifiedPayrollRule): CalculationResult {
  try {
    if (!/^2026-(10|11|12)$/.test(input.month)) throw new Error('固定工资情景仅开放2026年10月至12月');
    if (input.scenarioConfirmed !== true) throw new Error(`请先确认固定工资情景：${FIXED_SALARY_SCENARIO_CONFIRMATION}`);
    money(input.grossCents, '每月税前工资');
    money(input.personalContributionCents, '每月个人缴费');
    if (input.personalContributionCents > input.grossCents) throw new Error('本简易情景只支持个人实扣不超过工资；代垫、补缴等请使用精确累计入口核对');
    const monthCount = Number(input.month.slice(5));
    const previousMonths = monthCount - 1;
    const priorGross = input.grossCents * previousMonths;
    const priorPersonal = input.personalContributionCents * previousMonths;
    money(priorGross, '此前累计工资');
    money(priorPersonal, '此前累计缴费');
    const preciseInput: VerifiedTakeHomeInput = {
      month: input.month,
      grossCents: input.grossCents,
      personalContributionCents: input.personalContributionCents,
      deductiblePersonalContributionCents: input.personalContributionCents,
      additionalDeductionCents: 0,
      contributionsConfirmed: true,
      currentDeductionMonths: 1,
      prior: { grossCents: priorGross, personalContributionCents: priorPersonal, additionalDeductionCents: 0, taxPaidCents: 0, deductionMonths: previousMonths },
    };
    // Validate the rule/table, dates and all derived context through the existing engine.
    // This intermediate result only evaluates current cumulative liability, not a payslip.
    const validated = calculateVerifiedTakeHome(preciseInput, rule);
    if (!validated.ok) return validated;
    if (rule.tax.scope.validFrom > '2026-01-01') throw new Error('税规则未覆盖自1月起的全部情景期间，不能推导此前累计预扣');
    if (rule.tax.monthlyDeductionCents !== 500_000) throw new Error('本情景仅支持普通每月5000元减除费用口径');
    const priorTaxable = Math.max(0, priorGross - priorPersonal - previousMonths * rule.tax.monthlyDeductionCents);
    const bracket = rule.tax.brackets.find((item) => item.upToCents === null || priorTaxable <= item.upToCents)!;
    // Round EACH cumulative tax to cents before subtraction, using the same verified table.
    const numerator = BigInt(priorTaxable) * BigInt(bracket.rateBps);
    const priorTax = Math.max(0, Number((numerator * BigInt(2) + BigInt(10_000)) / BigInt(20_000)) - bracket.quickDeductionCents);
    money(priorTax, '此前累计预扣税');
    preciseInput.prior.taxPaidCents = priorTax;
    const result = calculateVerifiedTakeHome(preciseInput, rule);
    if (!result.ok) return result;
    const cumulativeTax = validated.lines.find((item) => item.id === 'withholding')!.amountCents;
    if (cumulativeTax < priorTax) throw new Error('固定工资情景累计税额非单调，请核验税表，不自动假设退税');
    return {
      ok: true,
      warnings: [
        `固定工资情景假设：${FIXED_SALARY_SCENARIO_CONFIRMATION}`,
        '结果用于固定输入的算术情景，不是实际工资单预测；实际累计工资、扣除或已缴税不同，请使用精确累计入口。',
        '前期与本期累计税额分别按分舍入后相减；本月预扣不等于年税除以12，年度汇算另行计算。',
        '本简易入口收窄为个人实扣不超过工资，不代表法律对所有代垫、补缴情形作此限制；不推算缴费比例或地方历史缴费金额。',
      ],
      lines: [
        ...result.lines.map((item) => ({ ...item, label: item.id === 'net' ? '固定工资情景：本月到手' : item.id === 'withholding' ? '固定工资情景：本月预扣个税' : item.label })),
        { id: 'scenario-prior-tax', label: '情景推导：此前累计已预扣税', amountCents: priorTax,
          formula: `此前 ${previousMonths} 月累计税基 ${priorTaxable} 分 × ${bracket.rateBps}/10000 − 速算扣除 ${bracket.quickDeductionCents} 分；累计税额四舍五入到分，按此前足额预扣假设`,
          sourceIds: [...rule.tax.sourceIds], scope: { ...rule.tax.scope } },
        { id: 'scenario-cumulative-tax', label: '情景推导：截至本月累计预扣税', amountCents: cumulativeTax,
          formula: `按 ${monthCount} 月累计税基查累计税率表并按分舍入；此前预扣 ${priorTax} 分 + 本月预扣 ${cumulativeTax - priorTax} 分`,
          sourceIds: [...rule.tax.sourceIds], scope: { ...rule.tax.scope } },
      ],
    };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : '固定工资情景计算失败'] };
  }
}
