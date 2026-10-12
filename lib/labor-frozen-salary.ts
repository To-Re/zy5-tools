import { calculateAnnualTax, type Evidence, type ResultLine, type TaxRule } from './labor-engine.ts';
import { calculateAutoContributionScenario, type AutoCity, type AutoContributionRule, type AutoContributionScenarioInput } from './labor-auto-scenario.ts';

export interface FrozenSalaryDeductionRule extends Evidence {
  itemId: 'pension' | 'medical' | 'unemployment';
  mode: 'full-paid' | 'paid-minus-fixed';
  /** Only a legally evidenced exclusion, never a guessed treatment of an unknown item. */
  excludedFixedCents?: number;
}
export interface FrozenSalaryComparisonRule extends Evidence {
  id: string;
  city: AutoCity;
  contributionRuleIds: string[];
  tax: TaxRule;
  deductions: FrozenSalaryDeductionRule[];
  ordinaryEmployerSocialExemption: Evidence;
  /** Full-tax only: an audited non-cash statutory unemployment contribution exemption.
   * This does not supply a missing employer rate or amount. */
  employerStatutoryExemptionWithoutAmount?: { unemployment: Evidence };
  /** Explicit product subset; never used to clamp or replace legal contribution limits. */
  inputDomain?: {
    gross: { minimumCents: number; maximumCents: number; stepCents: number };
    priorAverageWage: { minimumCents: number; maximumCents: number; stepCents: number };
    housingRateBps: number[];
    note: string;
  };
  /** Independently verified tax limit, not inferred from a contribution cap.
   * This version rejects either party's housing amount above the tax limit. */
  housingTax: Evidence & { maximumBaseCents: number; maximumRateBps: number };
}
export interface FrozenSalaryComparisonInput extends AutoContributionScenarioInput {
  /** Resident ordinary wage only, 12 identical hypothetical pay periods, no additional
   * income/deductions/exemptions/relief/special treatment; current rules frozen, not history. */
  frozenComparisonConfirmed: boolean;
}
export type FrozenSalaryComparisonResult = {
  ok: true;
  meaning: 'frozen-twelve-period-comparison' | 'frozen-zero-tax-bound-proof';
  lines: ResultLine[];
  warnings: string[];
  monthlyMean: { numeratorCents: number; denominator: 12; roundedCents: number; approximate: boolean };
} | { ok: false; errors: string[] };

export const FROZEN_SALARY_COMPARISON_CONFIRMATION = '仅作普通居民工资的固定规则比较：将所选月份缴费规则冻结为12个相同工资期；无其他收入、扣除、免税、减免或特殊计税。这不是实际年度汇算、历史缴费还原或本月到账预测。';

const MAX_CENTS = 100_000_000_000;
function money(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) throw new Error(`${label}须为支持范围内的非负整数分`);
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function evidence(value: Evidence, month: string): void {
  if (!value.sourceIds?.length || value.sourceIds.some((id) => !id?.trim()) || !value.scope?.region?.trim() || !value.scope.population?.trim()) throw new Error('税收比较缺少完整适用范围或官方来源');
  const { validFrom, validTo, verifiedOn } = value.scope;
  if (![validFrom, validTo, verifiedOn].every(validDate) || validFrom > validTo) throw new Error('税收比较规则日期无效');
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  if (`${month}-01` < validFrom || `${month}-${last}` > validTo) throw new Error('当前规则快照月份不在税收比较支持期间内');
}
function subset(ids: string[], parent: string[]): void {
  if (!ids.length || ids.some((id) => !parent.includes(id))) throw new Error('逐项税前扣除来源未完整登记');
}
function line(id: string, label: string, amountCents: number, formula: string, source: Evidence): ResultLine {
  if (!Number.isSafeInteger(amountCents)) throw new Error('比较结果超出安全整数分范围');
  return { id, label, amountCents, formula, sourceIds: [...new Set(source.sourceIds)], scope: { ...source.scope } };
}

/** Freeze one verified month's rules for a 12-period counterfactual comparison.
 * It neither reconstructs historical payments nor calculates a current-month withholding. */
export function calculateFrozenSalaryComparison(
  input: FrozenSalaryComparisonInput,
  contributionRules: AutoContributionRule[],
  rule?: FrozenSalaryComparisonRule,
): FrozenSalaryComparisonResult {
  try {
    if (input.frozenComparisonConfirmed !== true) throw new Error(`请先选择固定规则12期比较：${FROZEN_SALARY_COMPARISON_CONFIRMATION}`);
    if (!rule || !rule.id?.trim() || rule.city !== input.city) throw new Error('该地区完整个人缴费及逐项税前扣除规则尚未准入，暂不开放税后比较');
    if (input.month !== '2026-10') throw new Error('本版固定规则比较仅使用2026年10月核验快照');
    if (input.socialBaseCents !== undefined || input.housingBaseCents !== undefined) throw new Error('税收比较只支持已审上年月均工资映射，不接受纯显式社保或公积金基数覆盖；缴费算式情景仍可使用这些输入');
    if (rule.inputDomain) {
      const domain = rule.inputDomain;
      if (!domain.note?.trim()) throw new Error('税收比较产品范围说明缺失');
      for (const [value, range, label] of [
        [input.grossCents, domain.gross, '当前月薪'],
        [input.priorAverageWageCents, domain.priorAverageWage, '上年度月均工资'],
      ] as const) {
        money(range.minimumCents, '产品范围下界'); money(range.maximumCents, '产品范围上界');
        if (range.maximumCents < range.minimumCents || !Number.isSafeInteger(range.stepCents) || range.stepCents <= 0) throw new Error('税收比较产品范围定义无效');
        money(value, label);
        if (value < range.minimumCents || value > range.maximumCents || value % range.stepCents !== 0) throw new Error(`${label}不在已准入的税收比较产品范围内；不改写工资或法定缴费基数：${domain.note}`);
      }
      if (!domain.housingRateBps?.length || domain.housingRateBps.some((rate) => !Number.isSafeInteger(rate) || rate <= 0 || rate > 10000) || !domain.housingRateBps.includes(input.housingRateBps)) throw new Error('公积金比例不在此税收比较的已准入产品范围内');
    }
    evidence(rule, input.month);
    evidence(rule.tax, input.month);
    subset(rule.tax.sourceIds, rule.sourceIds);
    evidence(rule.ordinaryEmployerSocialExemption, input.month);
    subset(rule.ordinaryEmployerSocialExemption.sourceIds, rule.sourceIds);
    if (rule.tax.annualDeductionCents !== 6_000_000) throw new Error('只支持普通居民工资年度60000元减除费用比较，不套特殊口径');
    const candidates = contributionRules.filter((item) => item.city === input.city && (input.city !== 'wenzhou' ? !item.area : item.area === input.wenzhouArea));
    if (candidates.length !== 1 || !rule.contributionRuleIds?.includes(candidates[0].id)) throw new Error('当前缴费规则包未被此税收比较规则明确准入');
    const contributionRule = candidates[0];
    if (contributionRule.extraMissing?.length) throw new Error('存在标准包之外的未核支付，不能排除额外应税工资影响');
    const calculation = calculateAutoContributionScenario(input, contributionRules);
    if (calculation.personal.status !== 'complete') throw new Error(`个人缴费尚不完整，不能计算税后比较：${calculation.personal.missing.map((item) => item.reason).join('；')}`);
    const employerPension = calculation.employer.lines.find((item) => item.id === 'employer-pension');
    const employerUnemployment = calculation.employer.lines.find((item) => item.id === 'employer-unemployment');
    if (!employerPension) throw new Error('单位养老的法定映射与金额未完整核验，不能默认其税收待遇');
    let unemploymentExemption: Evidence | undefined;
    if (!employerUnemployment) {
      unemploymentExemption = rule.employerStatutoryExemptionWithoutAmount?.unemployment;
      if (!unemploymentExemption) throw new Error('单位失业金额缺失，且无单独准入的普通法定单位失业缴费免税范围依据');
      evidence(unemploymentExemption, input.month);
      subset(unemploymentExemption.sourceIds, rule.sourceIds);
      if (calculation.employer.missing.some((item) => item.itemId !== 'unemployment' && item.itemId !== 'injury')) throw new Error('失业专门豁免不能覆盖其他单位未知支付或税收条件');
    }
    const paidRow = calculation.personal.lines.find((item) => item.id === 'personal-total')!;
    const monthlyPaid = paidRow.amountCents;
    money(monthlyPaid, '每期个人实扣情景合计');
    if (monthlyPaid > input.grossCents) throw new Error(`方案工资不足支付个人缴费，尚需补足 ${monthlyPaid - input.grossCents} 分现金；保留缴费分项复核，但不假设工资外资金已支付或输出负数税后到账`);
    const deductionRows: ResultLine[] = [];
    for (const itemId of ['pension', 'medical', 'unemployment'] as const) {
      const matches = rule.deductions.filter((item) => item.itemId === itemId);
      if (matches.length !== 1) throw new Error(`${itemId}缺少唯一、已审的税前扣除口径`);
      const deduction = matches[0];
      evidence(deduction, input.month); subset(deduction.sourceIds, rule.sourceIds);
      const paid = calculation.personal.lines.find((item) => item.id === `personal-${itemId}`)!;
      let excluded = 0;
      if (deduction.mode === 'paid-minus-fixed') {
        const fixed = contributionRule.items.find((item) => item.payer === 'personal' && item.id === itemId)!.fixedCents;
        money(deduction.excludedFixedCents!, '经依据排除的固定部分');
        if (deduction.excludedFixedCents !== fixed || fixed > paid.amountCents) throw new Error('扣除排除额必须与已审缴费项目的固定部分一致，不能猜测或排除比例部分');
        excluded = fixed;
      } else if (deduction.mode !== 'full-paid' || (deduction.excludedFixedCents !== undefined && deduction.excludedFixedCents !== 0)) throw new Error('税前扣除方式不完整或含互相矛盾的固定排除额');
      deductionRows.push(line(`comparison-deductible-${itemId}`, `${paid.label}中的依法可扣情景金额`, paid.amountCents - excluded,
        `当前情景实扣 ${paid.amountCents} 分 − 依据已审扣除口径排除的固定部分 ${excluded} 分`,
        { sourceIds: [...paid.sourceIds, ...deduction.sourceIds], scope: { ...rule.scope } }));
    }
    const housingTax = rule.housingTax;
    evidence(housingTax, input.month); subset(housingTax.sourceIds, rule.sourceIds);
    money(housingTax.maximumBaseCents, '独立住房税收基数上限');
    if (!Number.isSafeInteger(housingTax.maximumRateBps) || housingTax.maximumRateBps <= 0 || housingTax.maximumRateBps > 10000) throw new Error('住房税收比例上限无效');
    money(input.priorAverageWageCents, '住房税收限额所需本人上年月均工资');
    const capNumerator = BigInt(Math.min(input.priorAverageWageCents, housingTax.maximumBaseCents)) * BigInt(housingTax.maximumRateBps);
    // The cap is a comparison boundary, not a payment to be rounded. Compare
    // integer-cent payments with the exact rational cap, including sub-cent caps.
    // Rounding the cap first could incorrectly admit a payment above the limit.
    const personalHousing = calculation.personal.lines.find((item) => item.id === 'personal-housing')!;
    const employerHousing = calculation.employer.lines.find((item) => item.id === 'employer-housing');
    if (!employerHousing) throw new Error('缺少单位住房缴存金额，不能排除单位超税限部分应并入工资的影响');
    if (BigInt(personalHousing.amountCents) * BigInt(10000) > capNumerator || BigInt(employerHousing.amountCents) * BigInt(10000) > capNumerator) throw new Error('个人或单位公积金超过本方案独立税收限额；本版未模拟单位超限计薪，暂不开放该范围的税后比较');
    deductionRows.push(line('comparison-deductible-housing', '每期个人公积金依法可扣情景金额', personalHousing.amountCents,
      `个人缴存 ${personalHousing.amountCents} 分和单位缴存 ${employerHousing.amountCents} 分均不超过独立税限 min(本人上年月均 ${input.priorAverageWageCents} 分, 地区税收基数上限 ${housingTax.maximumBaseCents} 分) × ${housingTax.maximumRateBps}/10000 = ${capNumerator}/10000 分；按有理数精确比较，不将限额舍入；超限范围不开放`,
      { sourceIds: [...personalHousing.sourceIds, ...employerHousing.sourceIds, ...housingTax.sourceIds], scope: { ...rule.scope } }));
    const monthlyDeductible = deductionRows.reduce((sum, item) => sum + item.amountCents, 0);
    money(monthlyDeductible, '每期依法可扣合计');
    if (monthlyDeductible > monthlyPaid) throw new Error('依法可扣金额不能超过个人实际缴费情景金额');
    const annualGross = input.grossCents * 12;
    const annualPaid = monthlyPaid * 12;
    const annualDeductible = monthlyDeductible * 12;
    money(annualGross, '12期工资合计'); money(annualPaid, '12期个人实扣合计'); money(annualDeductible, '12期依法可扣合计');
    const taxResult = calculateAnnualTax({ year: Number(input.month.slice(0, 4)), taxableComprehensiveIncomeCents: annualGross,
      personalContributionCents: annualDeductible, additionalDeductionCents: 0, taxPaidCents: 0 }, rule.tax);
    if (!taxResult.ok) return taxResult;
    // Only the liability formula is reused. The annual settlement/balance row is not returned.
    const annualTax = taxResult.lines.find((item) => item.id === 'annual-tax')!.amountCents;
    const taxable = taxResult.lines.find((item) => item.id === 'annual-taxable')!.amountCents;
    const annualNet = annualGross - annualPaid - annualTax;
    if (!Number.isSafeInteger(annualNet)) throw new Error('12期净额超过安全整数分范围');
    const sign = annualNet < 0 ? -1 : 1;
    const roundedMean = sign * Number((BigInt(Math.abs(annualNet)) * BigInt(2) + BigInt(12)) / BigInt(24));
    const approximate = annualNet % 12 !== 0;
    const basis: Evidence = { sourceIds: [...new Set([...paidRow.sourceIds, ...employerPension.sourceIds, ...(employerUnemployment?.sourceIds ?? []), ...(unemploymentExemption?.sourceIds ?? []), ...deductionRows.flatMap((item) => item.sourceIds), ...rule.sourceIds, ...rule.tax.sourceIds])], scope: { ...rule.scope } };
    return {
      ok: true, meaning: 'frozen-twelve-period-comparison',
      monthlyMean: { numeratorCents: annualNet, denominator: 12, roundedCents: roundedMean, approximate },
      warnings: [FROZEN_SALARY_COMPARISON_CONFIRMATION,
        ...(rule.inputDomain ? [`税收比较产品范围：${rule.inputDomain.note}；不是法律规定的工资或缴费基数范围。`] : []),
        ...(unemploymentExemption ? ['单位失业缴费仅按已审普通法定缴费、不构成个人应税薪酬的模型条件处理；费率和金额仍未知，不记为0，也不据此计算完整单位成本。'] : []),
        '个人实扣 D 与依法可扣 L 分别核算；净现金扣除 D，税基仅扣除 L，不以缴费合法自动推定全部税前可扣。',
        '规则仅核验所选快照月，重复12期是模型假设，不回填1—9月，不保证今后政策不变。没有真实年度已缴税记录，不输出汇算应补退额。',
        '单位完整缴费可有其他缺项，税后比较只要求个人完整与必要的单位公积金税限核验；它不表示公司成本已完整。',
        '月均净额按12期净额除12；无法整除到分时显示约值。展示取分不是税法或地方缴费舍入，年度总额保持原数。',
      ],
      lines: [
        ...deductionRows,
        line('comparison-monthly-paid', '每期个人实际缴费情景 D', monthlyPaid, '当期规则下各个人缴费的完整合计；不代表历史实际缴费', basis),
        line('comparison-monthly-deductible', '每期依法可扣情景 L', monthlyDeductible, '逐项按已审扣除口径计算后相加，与实扣 D 独立', basis),
        line('comparison-annual-gross', '固定规则12期工资合计', annualGross, '方案每期工资 × 12', basis),
        line('comparison-annual-paid', '固定规则12期个人实扣合计', annualPaid, '每期实扣 D × 12；仅重复快照模型', basis),
        line('comparison-annual-deductible', '固定规则12期依法可扣合计', annualDeductible, '每期可扣 L × 12；仅重复快照模型', basis),
        line('comparison-annual-taxable', '固定规则12期税基对照', taxable, 'max(0, 12期工资 − 12期依法可扣金额 − 普通年度减除费用60000元)', basis),
        line('comparison-annual-tax', '固定规则12期税额对照', annualTax, '以上方案税基按所选年度税表计算并取分；不是已发生年度税款或本月预扣', basis),
        line('comparison-annual-net', '固定规则12期税后净额对照', annualNet, '12期工资 − 12期实际缴费 D − 方案税额；无其他收入扣除或单位超税限住房增量', basis),
        line('comparison-monthly-mean-net', `${approximate ? '约：' : ''}固定规则月均税后净额`, roundedMean, `${annualNet} 分 ÷ 12${approximate ? '；不能整除到分，仅展示四舍五入约值' : '；恰好整分'}；不是本月实发`, basis),
      ],
    };
  } catch (error) { return { ok: false, errors: [error instanceof Error ? error.message : '固定规则税收比较失败'] }; }
}


export interface FrozenZeroTaxProofRule extends Evidence {
  id: string;
  city: AutoCity;
  contributionRuleIds: string[];
  tax: TaxRule;
  certainPensionDeduction: Evidence;
  /** These are included in full only as an upper bound, not declared actually taxable. */
  employerHousingTaxableBound: Evidence;
  employerMedicalTaxableBound: Evidence;
  /** Supports the ordinary non-taxable treatment of the remaining statutory employer
   * social contributions in the covered population, with no other wage benefits. */
  ordinaryEmployerSocialExemption: Evidence;
}

/** Robust zero-tax subset. Unknown deductions are set to zero; employer housing AND
 * all employer medical contributions are included in taxable income's upper bound.
 * It never asserts that the uncertain benefits really are taxable or deductible. */
export function calculateFrozenZeroTaxComparison(
  input: FrozenSalaryComparisonInput,
  contributionRules: AutoContributionRule[],
  rule?: FrozenZeroTaxProofRule,
): FrozenSalaryComparisonResult {
  try {
    if (input.frozenComparisonConfirmed !== true) throw new Error(`请先选择固定规则12期比较：${FROZEN_SALARY_COMPARISON_CONFIRMATION}`);
    if (!rule || !rule.id?.trim() || rule.city !== input.city) throw new Error('该地区零税上界证明范围尚未准入');
    if (input.month !== '2026-10') throw new Error('零税证明仅使用2026年10月已核规则快照');
    if (input.socialBaseCents !== undefined || input.housingBaseCents !== undefined) throw new Error('零税证明不接受纯显式基数覆盖，必须使用已审上年月均工资映射，不能夸大确定可扣养老');
    evidence(rule, input.month);
    for (const item of [rule.tax, rule.certainPensionDeduction, rule.employerHousingTaxableBound, rule.employerMedicalTaxableBound, rule.ordinaryEmployerSocialExemption]) {
      evidence(item, input.month); subset(item.sourceIds, rule.sourceIds);
    }
    if (rule.tax.annualDeductionCents !== 6000000) throw new Error('零税证明只支持普通居民年度60000元减除费用');
    const candidates = contributionRules.filter((item) => item.city === input.city && (input.city !== 'wenzhou' ? !item.area : item.area === input.wenzhouArea));
    if (candidates.length !== 1 || !rule.contributionRuleIds.includes(candidates[0].id)) throw new Error('缴费规则未纳入零税上界证明准入范围');
    const current = calculateAutoContributionScenario(input, contributionRules);
    if (current.personal.status !== 'complete') throw new Error('个人缴费尚不完整，不能给出固定规则净现金情景');
    const employerPension = current.employer.lines.find((row) => row.id === 'employer-pension');
    const employerUnemployment = current.employer.lines.find((row) => row.id === 'employer-unemployment');
    if (!employerPension || !employerUnemployment) throw new Error('单位养老或失业规则和金额缺失，无法验证其普通法定缴费范围与税收待遇');
    const paid = current.personal.lines.find((row) => row.id === 'personal-total')!;
    const pension = current.personal.lines.find((row) => row.id === 'personal-pension')!;
    const housing = current.employer.lines.find((row) => row.id === 'employer-housing');
    const medical = current.employer.lines.find((row) => row.id === 'employer-medical');
    if (!housing || !medical) throw new Error('单位公积金或单位医疗金额不完整，不能形成保守应税收入上界');
    if (candidates[0].extraMissing?.length) throw new Error('仍有标准包之外的未核项目，零税上界不能穷尽潜在收入或扣款');
    const annualGross = input.grossCents * 12;
    const annualPaid = paid.amountCents * 12;
    const annualTaxableIncomeUpper = (input.grossCents + housing.amountCents + medical.amountCents) * 12;
    const annualCertainDeduction = pension.amountCents * 12;
    for (const [label, value] of Object.entries({ annualGross, annualPaid, annualTaxableIncomeUpper, annualCertainDeduction })) money(value, label);
    const beforeFloor = annualTaxableIncomeUpper - annualCertainDeduction - rule.tax.annualDeductionCents;
    if (beforeFloor > 0) throw new Error('计入全部单位医疗及公积金、仅扣确定养老后的税基上界仍大于零；本模式不能证明零税，不给近似税后数');
    const tax = calculateAnnualTax({ year: Number(input.month.slice(0, 4)), taxableComprehensiveIncomeCents: annualTaxableIncomeUpper,
      personalContributionCents: annualCertainDeduction, additionalDeductionCents: 0, taxPaidCents: 0 }, rule.tax);
    if (!tax.ok) return tax;
    const upperTax = tax.lines.find((row) => row.id === 'annual-tax')!.amountCents;
    if (upperTax !== 0) throw new Error('税表未能验证零税上界，拒绝给出净额');
    const annualNet = annualGross - annualPaid;
    if (!Number.isSafeInteger(annualNet)) throw new Error('固定规则净额超过安全整数分');
    const sign = annualNet < 0 ? -1 : 1;
    const roundedMean = sign * Number((BigInt(Math.abs(annualNet)) * BigInt(2) + BigInt(12)) / BigInt(24));
    const approximate = annualNet % 12 !== 0;
    const basis: Evidence = { sourceIds: [...new Set([...rule.sourceIds, ...paid.sourceIds, ...pension.sourceIds, ...housing.sourceIds, ...medical.sourceIds, ...employerPension.sourceIds, ...employerUnemployment.sourceIds])], scope: { ...rule.scope } };
    return {
      ok: true, meaning: 'frozen-zero-tax-bound-proof', monthlyMean: { numeratorCents: annualNet, denominator: 12, roundedCents: roundedMean, approximate },
      warnings: [FROZEN_SALARY_COMPARISON_CONFIRMATION,
        '仅开放保守上界仍为零税的普通情景。将单位医疗和单位公积金全额加入应税收入上界，不代表断言这些缴费实际全部应税。',
        '只将确定的个人养老纳入扣除下界；医保、失业和个人公积金全部暂不计扣除，不代表断言它们依法不得扣，也不宣称实际缴费 D 等于完整合法扣除 L。',
        '仅适用已审普通法定社保范围且没有额外应税福利、其他收入、奖金或特殊处理。工伤实际费率未知不用于猜测完整公司成本。',
        '现金净额只用工资减个人实际缴费；作为应税上界纳入的单位缴费不视为向个人支付现金，不加入净现金。',
        '这不是历史规则回填、真实年度汇算或本月预扣；上界大于零时停止该比较，仍可查看已核当月缴费。',
      ],
      lines: [
        line('comparison-monthly-paid', '每期完整个人缴费情景 D', paid.amountCents, '当前已核规则下个人各项相加；12期仅重复此快照', basis),
        line('comparison-certain-pension-deduction', '每期确定养老扣除下界', pension.amountCents, '仅计已核个人基本养老；其余未知扣除按0构造保守上界，不把该数称为完整合法扣除 L', basis),
        line('comparison-employer-income-upper-addition', '每期单位缴费计入收入上界的金额', housing.amountCents + medical.amountCents,
          `单位住房 ${housing.amountCents} 分 + 单位医疗 ${medical.amountCents} 分；仅构造上界，不认定实际应税或个人现金收入`, basis),
        line('comparison-taxable-upper-bound', '固定12期应纳税所得额上界', Math.max(0, beforeFloor),
          `max(0, 12 × (工资 ${input.grossCents} 分 + 单位住房 ${housing.amountCents} 分 + 单位医疗 ${medical.amountCents} 分 − 确定个人养老 ${pension.amountCents} 分) − 6000000 分)；取零前 ${beforeFloor} 分`, basis),
        line('comparison-annual-gross', '固定规则12期工资合计', annualGross, '每期工资 × 12；未将非现金单位缴费加入现金工资', basis),
        line('comparison-annual-paid', '固定规则12期个人缴费合计', annualPaid, '完整个人实际缴费情景 D × 12', basis),
        line('comparison-annual-tax', '固定12期零税证明结果', 0, '最不利应纳税所得额上界为0；按已核年度税表税额亦为0，不需猜未知扣除的精确值', basis),
        line('comparison-annual-net', '固定规则12期税后净现金', annualNet, '12期现金工资 − 12期完整个人缴费 − 已证明的零税；非真实年度到账合计', basis),
        line('comparison-monthly-mean-net', `${approximate ? '约：' : ''}固定规则月均税后净现金`, roundedMean, `${annualNet} 分 ÷ 12；固定政策零税范围，非本月到账预测`, basis),
      ],
    };
  } catch (error) { return { ok: false, errors: [error instanceof Error ? error.message : '零税上界证明失败'] }; }
}
