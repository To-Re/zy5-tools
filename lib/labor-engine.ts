/** Pure, local-only arithmetic. Rules must be independently verified before being passed here. */
export type Month = string; // YYYY-MM
export type Regime = 'employee' | 'flexible' | 'resident';
export type Rounding = 'half-up-cent' | 'ceil-jiao';
export interface RuleScope {
  region: string;
  population: string;
  validFrom: string;
  validTo: string;
  verifiedOn: string;
}
export interface Evidence {
  sourceIds: string[];
  scope: RuleScope;
}
export interface ResultLine extends Evidence {
  id: string;
  label: string;
  amountCents: number;
  formula: string;
}
export interface CalculationSuccess {
  ok: true;
  lines: ResultLine[];
  warnings: string[];
}
export type CalculationResult = CalculationSuccess | { ok: false; errors: string[] };
export interface TaxBracket {
  upToCents: number | null;
  rateBps: number;
  quickDeductionCents: number;
}
export interface TaxRule extends Evidence {
  id: string;
  annualDeductionCents: number;
  monthlyDeductionCents: number;
  brackets: TaxBracket[];
}
export interface ContributionRule extends Evidence {
  id: string;
  label: string;
  baseMinCents: number;
  baseMaxCents: number;
  employeeRateBps: number;
  employerRateBps: number;
  rounding: Rounding;
}
export interface PayrollRule extends Evidence {
  id: string;
  regime: 'employee';
  complete: boolean;
  contributions: ContributionRule[];
  tax: TaxRule;
}
export interface PayrollInput {
  month: Month;
  grossCents: number;
  /** Each declared base is explicit: current salary is not necessarily last year's average. */
  contributionBases: Record<string, number>;
  additionalDeductionCents: number;
  /** Cumulative context before this pay period, for this same withholding agent and tax year. */
  prior: {
    grossCents: number;
    personalContributionCents: number;
    additionalDeductionCents: number;
    taxPaidCents: number;
    deductionMonths: number;
  };
  currentDeductionMonths: number;
  extraEmployerCostCents: number;
}
export interface AnnualTaxInput {
  year: number;
  taxableComprehensiveIncomeCents: number;
  personalContributionCents: number;
  additionalDeductionCents: number;
  taxPaidCents: number;
}
export interface ContributionSegment {
  id: string;
  region: string;
  regime: Regime;
  from: Month;
  to: Month;
  bases: Record<string, number>;
}
export interface ContributionPeriodRule extends Evidence {
  id: string;
  regime: 'employee' | 'flexible';
  complete: boolean;
  contributions: ContributionRule[];
}
export interface PensionRule extends Evidence {
  id: string;
  regime: 'employee';
  /** Only audited populations with neither transitional nor deemed-service benefits. */
  supportedPopulation: string;
  baseRateBps: number;
  serviceYearDecimals: number;
  componentRounding: Rounding;
  totalRounding: Rounding;
  accountDivisors: Record<number, number>;
  supportedRetirementYears: number[];
  minimumContributionMonths: number;
  minimumRetirementAgeMonths: number;
  maximumRetirementAgeMonths: number;
}
export interface PensionInput {
  ruleYear: number;
  ruleDate: string;
  population: string;
  benefitRegionConfirmed: boolean;
  qualificationConfirmed: boolean;
  hasTransitionalOrDeemedService: boolean;
  retirementAgeMonths: number;
  contributionMonths: number;
  pensionBaseCents: number;
  averageContributionIndex: number;
  personalAccountCents: number;
  payoutYears: number;
}
export interface InverseResult {
  status: 'unique' | 'multiple' | 'none' | 'blocked';
  minimum?: number;
  maximum?: number;
  error?: string;
  attainableMinimumCents?: number;
  attainableMaximumCents?: number;
}

function money(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000_000) throw new Error(`${label}须为非负整数分，且不超过10亿元`);
}
function integer(value: number, min: number, max: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label}超出范围`);
}
function monthIndex(value: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('年月须为 YYYY-MM');
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1;
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function evidence(rule: Evidence): void {
  if (!rule.sourceIds.length || rule.sourceIds.some((id) => !id.trim()) || !rule.scope.region || !rule.scope.population || !validDate(rule.scope.verifiedOn) || !validDate(rule.scope.validFrom) || !validDate(rule.scope.validTo) || rule.scope.validFrom > rule.scope.validTo) throw new Error('缺少完整适用范围或官方来源，拒绝计算');
  monthIndex(rule.scope.validFrom.slice(0, 7));
  monthIndex(rule.scope.validTo.slice(0, 7));
}
function applicable(rule: Evidence, month: Month): void {
  evidence(rule);
  const index = monthIndex(month);
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  if ((month === rule.scope.validFrom.slice(0, 7) && !rule.scope.validFrom.endsWith('-01')) || (month === rule.scope.validTo.slice(0, 7) && Number(rule.scope.validTo.slice(8)) < lastDay)) throw new Error('规则在月中变更，未核验分段月口径，拒绝按整月计算');
  if (index < monthIndex(rule.scope.validFrom.slice(0, 7)) || index > monthIndex(rule.scope.validTo.slice(0, 7))) throw new Error(`${month} 不在已核验规则有效期内`);
}
function roundRatio(numerator: number, denominator: number, mode: Rounding): number {
  // BigInt prevents sub-cent floating-point error for all integer-cent rate products.
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) throw new Error('计算超出精确整数范围');
  return roundBigRatio(BigInt(numerator), BigInt(denominator), mode);
}
function roundBigRatio(n: bigint, d: bigint, mode: Rounding): number {
  if (n < BigInt(0) || d <= BigInt(0)) throw new Error('舍入参数无效');
  const rounded = mode === 'ceil-jiao' ? ((n + d * BigInt(10) - BigInt(1)) / (d * BigInt(10))) * BigInt(10) : (n * BigInt(2) + d) / (d * BigInt(2));
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new Error('结果超出精确整数范围');
  return result;
}
function decimalRatio(value: number): { n: bigint; d: bigint } {
  // Preserve the decimal parameter as entered, including scientific notation.
  const [coefficient, exponentText = '0'] = String(value).split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const power = fraction.length - Number(exponentText);
  if (Math.abs(power) > 20) throw new Error('缴费指数精度超出支持范围');
  const digits = BigInt(whole + fraction);
  return power >= 0 ? { n: digits, d: BigInt(10) ** BigInt(power) } : { n: digits * BigInt(10) ** BigInt(-power), d: BigInt(1) };
}
function line(id: string, label: string, amountCents: number, formula: string, rule: Evidence): ResultLine {
  evidence(rule);
  if (!Number.isSafeInteger(amountCents)) throw new Error('结果无法精确表示为整数分');
  return { id, label, amountCents, formula, sourceIds: [...rule.sourceIds], scope: { ...rule.scope } };
}
function combined(rule: Evidence, others: Evidence[]): Evidence {
  return { scope: rule.scope, sourceIds: [...new Set([rule, ...others].flatMap((item) => item.sourceIds))] };
}
function guarded(calculate: () => CalculationSuccess): CalculationResult {
  try { return calculate(); } catch (error) { return { ok: false, errors: [error instanceof Error ? error.message : '计算失败'] }; }
}
function validateTax(rule: TaxRule): void {
  evidence(rule);
  money(rule.annualDeductionCents, '年度减除费用');
  money(rule.monthlyDeductionCents, '月度减除费用');
  if (!rule.brackets.length || rule.brackets.at(-1)?.upToCents !== null) throw new Error('税率表不完整');
  let previous = -1;
  rule.brackets.forEach((bracket, index) => {
    integer(bracket.rateBps, 0, 10000, '税率');
    money(bracket.quickDeductionCents, '速算扣除数');
    if (bracket.upToCents === null) {
      if (index !== rule.brackets.length - 1) throw new Error('税率表顺序错误');
    } else {
      money(bracket.upToCents, '税率级距');
      if (bracket.upToCents <= previous) throw new Error('税率级距应递增');
      previous = bracket.upToCents;
    }
  });
}
function progressiveTax(taxableCents: number, rule: TaxRule): number {
  validateTax(rule);
  const bracket = rule.brackets.find((item) => item.upToCents === null || taxableCents <= item.upToCents)!;
  return Math.max(0, roundRatio(taxableCents * bracket.rateBps, 10000, 'half-up-cent') - bracket.quickDeductionCents);
}
function contributions(base: number, rule: ContributionRule, month: Month): { personal: number; employer: number; base: number } {
  applicable(rule, month);
  money(base, '申报缴费基数');
  money(rule.baseMinCents, '基数下限');
  money(rule.baseMaxCents, '基数上限');
  if (rule.baseMinCents > rule.baseMaxCents) throw new Error('缴费基数上下限错误');
  integer(rule.employeeRateBps, 0, 10000, '个人缴费比例');
  integer(rule.employerRateBps, 0, 10000, '单位缴费比例');
  const clamped = Math.max(rule.baseMinCents, Math.min(rule.baseMaxCents, base));
  return {
    base: clamped,
    personal: roundRatio(clamped * rule.employeeRateBps, 10000, rule.rounding),
    employer: roundRatio(clamped * rule.employerRateBps, 10000, rule.rounding),
  };
}
export function calculatePayroll(input: PayrollInput, rule: PayrollRule): CalculationResult {
  return guarded(() => {
    applicable(rule, input.month);
    applicable(rule.tax, input.month);
    if (!rule.complete || !rule.contributions.length || rule.regime !== 'employee') throw new Error('该地区/制度的完整缴费规则尚未核验，暂不开放工资计算');
    money(input.grossCents, '税前工资');
    money(input.additionalDeductionCents, '本期其他合法扣除');
    money(input.extraEmployerCostCents, '其他单位成本');
    if (!input.prior) throw new Error('须提供本年同一扣缴单位的累计预扣背景');
    for (const [key, value] of Object.entries(input.prior)) money(value, key);
    integer(input.prior.deductionMonths, 0, 11, '累计减除费用月数');
    integer(input.currentDeductionMonths, 1, 12, '本期减除费用月数');
    const months = input.prior.deductionMonths + input.currentDeductionMonths;
    if (months > Number(input.month.slice(5)) || months > 12) throw new Error('累计减除费用月数不能超过当前纳税月份');
    const details: ResultLine[] = [];
    let personal = 0, employer = 0;
    for (const contribution of rule.contributions) {
      if (!(contribution.id in input.contributionBases)) throw new Error(`缺少${contribution.label}申报基数`);
      const amounts = contributions(input.contributionBases[contribution.id], contribution, input.month);
      personal += amounts.personal;
      employer += amounts.employer;
      details.push(line(`personal-${contribution.id}`, `个人${contribution.label}`, amounts.personal, `限额后基数 ${amounts.base} 分 × ${contribution.employeeRateBps}/10000；${contribution.rounding}`, contribution));
      details.push(line(`employer-${contribution.id}`, `单位${contribution.label}`, amounts.employer, `限额后基数 ${amounts.base} 分 × ${contribution.employerRateBps}/10000；${contribution.rounding}`, contribution));
    }
    const taxable = Math.max(0, input.prior.grossCents + input.grossCents - input.prior.personalContributionCents - personal - months * rule.tax.monthlyDeductionCents - input.prior.additionalDeductionCents - input.additionalDeductionCents);
    const cumulativeTax = progressiveTax(taxable, rule.tax);
    const withholding = Math.max(0, cumulativeTax - input.prior.taxPaidCents);
    const basis = combined(rule, [rule.tax, ...rule.contributions]);
    return { ok: true, warnings: ['仅计算居民个人普通工资薪金、按月5000元减除费用、无免税收入/减免税额/特殊简化预扣的情形；不含年终奖单独计税、非居民、劳务报酬等。预扣负差额本期不退，年度汇算另算。', '其他单位成本为用户自填情景，不代表已包含全部用工支出。'], lines: [
      ...details,
      line('personal-total', '个人缴费合计', personal, '逐项个人缴费按各自规则舍入后相加', basis),
      line('employer-total', '单位缴费合计', employer, '逐项单位缴费按各自规则舍入后相加', basis),
      line('taxable-cumulative', '累计预扣应纳税所得额', taxable, 'max(0, 累计工资 − 累计个人缴费 − 累计减除费用 − 累计其他合法扣除)', basis),
      line('withholding', '本期预扣个税', withholding, `max(0, 累计应纳税额 ${cumulativeTax} 分 − 已预扣 ${input.prior.taxPaidCents} 分)`, basis),
      line('net', '本期税后实发', input.grossCents - personal - withholding, '本期税前工资 − 本期个人缴费 − 本期预扣个税', basis),
      line('company-cost', '本期单位成本情景', input.grossCents + employer + input.extraEmployerCostCents, '税前工资 + 单位缴费 + 用户自填其他单位成本', basis),
    ] };
  });
}
export function calculateAnnualTax(input: AnnualTaxInput, rule: TaxRule): CalculationResult {
  return guarded(() => {
    applicable(rule, `${input.year}-12`);
    for (const [key, value] of Object.entries(input)) money(value, key);
    const taxable = Math.max(0, input.taxableComprehensiveIncomeCents - input.personalContributionCents - input.additionalDeductionCents - rule.annualDeductionCents);
    const due = progressiveTax(taxable, rule);
    return { ok: true, warnings: ['综合所得收入额须已按各所得类别法定口径换算；不直接把劳务报酬等流水作为收入额。其他扣除需满足适用条件。'], lines: [
      line('annual-taxable', '全年应纳税所得额', taxable, 'max(0, 全年综合所得收入额 − 年度减除费用 − 专项扣除 − 其他合法扣除)', rule),
      line('annual-tax', '全年应纳税额', due, '应纳税所得额 × 适用税率 − 速算扣除数', rule),
      line('annual-balance', '汇算差额（正数补税，负数退税）', due - input.taxPaidCents, '全年应纳税额 − 已预缴税额；不判断免办汇算条件', rule),
    ] };
  });
}

export function calculateContributionPlan(segments: ContributionSegment[], rules: ContributionPeriodRule[]): CalculationResult {
  return guarded(() => {
    if (!segments.length || segments.length > 100) throw new Error('请填写1–100段缴费计划');
    const occupied = new Set<number>();
    const lines: ResultLine[] = [];
    for (const segment of segments) {
      if (segment.regime === 'resident') throw new Error('城乡居民制度暂未核验，不与职工制度混算');
      const from = monthIndex(segment.from), to = monthIndex(segment.to);
      if (to < from || to - from > 1200) throw new Error('分期起止年月不合法或超过100年');
      for (let index = from; index <= to; index++) {
        if (occupied.has(index)) throw new Error('缴费年月重叠；不能重复累计年限');
        occupied.add(index);
        const month = `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
        const matches = rules.filter((rule) => rule.scope.region === segment.region && rule.regime === segment.regime && index >= monthIndex(rule.scope.validFrom.slice(0, 7)) && index <= monthIndex(rule.scope.validTo.slice(0, 7)));
        if (matches.length !== 1 || !matches[0].complete || !matches[0].contributions.length) throw new Error(`${segment.region} ${month} 缺少唯一、完整的缴费规则；不可用现行参数回填历史`);
        const rule = matches[0];
        applicable(rule, month);
        let personal = 0, employer = 0;
        for (const item of rule.contributions) {
          if (!(item.id in segment.bases)) throw new Error(`${month} 缺少${item.label}缴费基数`);
          const amounts = contributions(segment.bases[item.id], item, month);
          personal += amounts.personal;
          employer += amounts.employer;
          lines.push(line(`${segment.id}-${month}-${item.id}-personal`, `${month} ${segment.region} 个人${item.label}`, amounts.personal, `限额后基数 ${amounts.base} 分 × ${item.employeeRateBps}/10000；${item.rounding}`, item));
          lines.push(line(`${segment.id}-${month}-${item.id}-employer`, `${month} ${segment.region} 单位${item.label}`, amounts.employer, `限额后基数 ${amounts.base} 分 × ${item.employerRateBps}/10000；${item.rounding}`, item));
        }
        const basis = combined(rule, rule.contributions);
        lines.push(line(`${segment.id}-${month}-personal`, `${month} ${segment.region} 个人缴费合计`, personal, '该月各险种个人缴费逐项舍入后相加', basis));
        lines.push(line(`${segment.id}-${month}-employer`, `${month} ${segment.region} 单位缴费合计`, employer, '该月各险种单位缴费逐项舍入后相加', basis));
      }
    }
    return { ok: true, lines, warnings: ['分期明细只表示缴费支出；不自动认定养老缴费年限、转移资格、退休地或待遇。跨地区历史指数须由领取地依适用规则核定。'] };
  });
}
export function calculatePensionScenario(input: PensionInput, rule: PensionRule): CalculationResult {
  return guarded(() => {
    evidence(rule);
    if (!validDate(input.ruleDate) || input.ruleDate < rule.scope.validFrom || input.ruleDate > rule.scope.validTo || Number(input.ruleDate.slice(0, 4)) !== input.ruleYear) throw new Error('请选择规则有效期内的明确规则日期');
    if (input.population !== rule.supportedPopulation || rule.regime !== 'employee') throw new Error('该养老身份不在已核验支持范围');
    if (!input.benefitRegionConfirmed || !input.qualificationConfirmed) throw new Error('须先由经办核定领取地区与退休资格；不能将各地区养老金分别计算再相加');
    if (input.hasTransitionalOrDeemedService) throw new Error('涉及过渡性养老金或视同缴费，现有公式不完整，禁止计算金额');
    if (!rule.supportedRetirementYears.includes(input.ruleYear)) throw new Error('该退休情景年度尚未核验，不套用其他年份退休资格');
    integer(input.retirementAgeMonths, rule.minimumRetirementAgeMonths, rule.maximumRetirementAgeMonths, '退休年龄月数');
    if (input.retirementAgeMonths % 12 !== 0) throw new Error('非整周岁计发月数缺少已核验口径，暂不计算金额');
    const divisor = rule.accountDivisors[input.retirementAgeMonths / 12];
    if (!Number.isSafeInteger(divisor) || divisor <= 0) throw new Error('该退休年龄没有已核验计发月数');
    integer(input.contributionMonths, rule.minimumContributionMonths, Math.min(720, input.retirementAgeMonths), '累计缴费月数');
    integer(input.payoutYears, 1, 60, '累计领取窗口');
    money(input.pensionBaseCents, '待遇计发基数');
    money(input.personalAccountCents, '个人账户余额');
    if (!Number.isFinite(input.averageContributionIndex) || input.averageContributionIndex <= 0 || input.averageContributionIndex > 100) throw new Error('平均缴费指数须为正数且不超过100；不擅自把跨省实际指数夹在0.6–3');
    integer(rule.baseRateBps, 0, 10000, '基础养老金计提比例');
    integer(rule.serviceYearDecimals, 0, 8, '年限精度');
    const yearScale = 10 ** rule.serviceYearDecimals;
    const scaledYears = roundRatio(input.contributionMonths * yearScale, 12, 'half-up-cent');
    const years = scaledYears / yearScale;
    const indexRatio = decimalRatio(input.averageContributionIndex);
    const basic = roundBigRatio(BigInt(input.pensionBaseCents) * (indexRatio.d + indexRatio.n) * BigInt(scaledYears) * BigInt(rule.baseRateBps), BigInt(2) * indexRatio.d * BigInt(yearScale) * BigInt(10000), rule.componentRounding);
    const account = roundRatio(input.personalAccountCents, divisor, rule.componentRounding);
    const monthly = roundRatio(basic + account, 1, rule.totalRounding);
    return { ok: true, warnings: ['固定规则日期和输入参数的金额情景，不预测未来工资、政策、利率或待遇调整；实际以主管部门核定为准。', '领取窗口只用于累计展示，不是养老金法定截止，不等于个人账户养老金计发月数。', '平均缴费指数、个人账户余额和缴费月数应来自领取地核定记录；本工具不从跨地区缴费计划自动推算。'], lines: [
      line('pension-basic', '基础养老金情景/月', basic, `${input.pensionBaseCents} 分 × (1 + ${input.averageContributionIndex}) ÷ 2 × ${years} 年 × ${rule.baseRateBps}/10000；${rule.componentRounding}`, rule),
      line('pension-account', '个人账户养老金情景/月', account, `${input.personalAccountCents} 分 ÷ ${divisor} 计发月数；${rule.componentRounding}`, rule),
      line('pension-monthly', '月养老金情景', monthly, `基础养老金 ${basic} 分 + 个人账户养老金 ${account} 分；${rule.totalRounding}`, rule),
      line('pension-window', `${input.payoutYears}年固定金额累计情景`, monthly * input.payoutYears * 12, `月金额 ${monthly} 分 × ${input.payoutYears} 年 × 12；不计待遇调整、利息或生存概率`, rule),
    ] };
  });
}
/** Finds the complete integer solution interval for a monotone nondecreasing audited function. */
export function solveMonotoneTarget(targetCents: number, minimum: number, maximum: number, evaluate: (value: number) => number): InverseResult {
  try {
    money(targetCents, '目标金额'); money(minimum, '逆算下界'); money(maximum, '逆算上界');
    if (maximum < minimum) throw new Error('逆算上界须不小于下界');
    const lowOutput = evaluate(minimum), highOutput = evaluate(maximum);
    if (!Number.isSafeInteger(lowOutput) || !Number.isSafeInteger(highOutput) || highOutput < lowOutput) throw new Error('逆算函数不符合单调整数金额要求');
    const common = { attainableMinimumCents: lowOutput, attainableMaximumCents: highOutput };
    if (targetCents < lowOutput || targetCents > highOutput) return { status: 'none', ...common };
    function firstAtLeast(value: number): number {
      let low = minimum, high = maximum + 1;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        if (evaluate(middle) >= value) high = middle;
        else low = middle + 1;
      }
      return low;
    }
    const first = firstAtLeast(targetCents);
    if (first > maximum || evaluate(first) !== targetCents) return { status: 'none', ...common };
    const last = Math.min(maximum, firstAtLeast(targetCents + 1) - 1);
    return { status: first === last ? 'unique' : 'multiple', minimum: first, maximum: last, ...common };
  } catch (error) { return { status: 'blocked', error: error instanceof Error ? error.message : '逆算失败' }; }
}
function resultAmount(result: CalculationResult, id: string): number {
  if (!result.ok) throw new Error(result.errors.join('；'));
  const value = result.lines.find((item) => item.id === id);
  if (!value) throw new Error('缺少计算结果');
  return value.amountCents;
}
export function invertNetSalary(input: PayrollInput, targetCents: number, bounds: { minCents: number; maxCents: number }, rule: PayrollRule): InverseResult {
  return solveMonotoneTarget(targetCents, bounds.minCents, bounds.maxCents, (grossCents) => resultAmount(calculatePayroll({ ...input, grossCents }, rule), 'net'));
}
export function solvePensionTarget(input: PensionInput, targetCents: number, bounds: { minAccountCents: number; maxAccountCents: number }, rule: PensionRule): InverseResult {
  return solveMonotoneTarget(targetCents, bounds.minAccountCents, bounds.maxAccountCents, (personalAccountCents) => resultAmount(calculatePensionScenario({ ...input, personalAccountCents }, rule), 'pension-monthly'));
}

export type RetirementCategory = 'original-50' | 'original-55' | 'original-60';
export interface RetirementRule extends Evidence {
  id: string;
  reforms: Array<{ category: RetirementCategory; baseAgeMonths: number; startBirthMonth: Month; stepBirthMonths: number; maxDelayMonths: number }>;
  minimumContributionMonthsByYear: Record<number, number>;
  finalMinimumYear: number;
  maximumFlexibleMonths: number;
}
export interface RetirementInput {
  birthMonth: Month;
  category: RetirementCategory;
  contributionMonths: number;
  choice: 'statutory' | 'early' | 'late';
  chosenRetirementMonth?: Month;
}
export interface RetirementSuccess extends Evidence {
  ok: true;
  statutoryRetirementMonth: Month;
  statutoryAgeMonths: number;
  chosenRetirementMonth: Month;
  chosenAgeMonths: number;
  minimumContributionMonths: number;
  contributionSufficient: boolean;
  formula: string;
  warnings: string[];
}
function toMonth(index: number): Month {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}
export function calculateRetirement(input: RetirementInput, rule: RetirementRule): RetirementSuccess | { ok: false; errors: string[] } {
  try {
    evidence(rule);
    const birth = monthIndex(input.birthMonth);
    integer(Number(input.birthMonth.slice(0, 4)), 1900, 2100, '出生年');
    integer(input.contributionMonths, 0, 1200, '缴费月数');
    integer(rule.maximumFlexibleMonths, 0, 120, '弹性月数');
    const reform = rule.reforms.find((item) => item.category === input.category);
    if (!reform) throw new Error('没有该原法定退休年龄类别的已核验规则；不能仅凭性别判断类别');
    integer(reform.baseAgeMonths, 480, 840, '原法定年龄');
    integer(reform.stepBirthMonths, 1, 120, '延退步长');
    integer(reform.maxDelayMonths, 0, 120, '延退上限');
    const offset = birth - monthIndex(reform.startBirthMonth);
    const delay = Math.max(0, Math.min(reform.maxDelayMonths, Math.floor(offset / reform.stepBirthMonths) + 1));
    const statutoryAge = reform.baseAgeMonths + delay;
    const statutory = birth + statutoryAge;
    if (statutory < monthIndex(rule.scope.validFrom.slice(0, 7))) throw new Error('改革生效前已达原退休年龄，不适用本工具改革及弹性规则');
    let chosen = statutory;
    if (input.choice !== 'statutory') {
      if (!input.chosenRetirementMonth) throw new Error('弹性退休须明确选择退休年月');
      chosen = monthIndex(input.chosenRetirementMonth);
      if (input.choice === 'early') {
        if (chosen >= statutory || chosen < Math.max(birth + reform.baseAgeMonths, statutory - rule.maximumFlexibleMonths)) throw new Error('弹性提前须早于法定退休月、不低于原法定年龄，且在已核验提前上限内');
      } else if (input.choice === 'late') {
        if (chosen <= statutory || chosen > statutory + rule.maximumFlexibleMonths) throw new Error('弹性延迟须晚于法定退休月且在已核验延迟上限内');
      } else throw new Error('退休选择类型无效');
    }
    if (chosen > monthIndex(rule.scope.validTo.slice(0, 7))) throw new Error('所选退休日期超出本版政策快照的计算覆盖范围');
    if (input.contributionMonths > chosen - birth) throw new Error('缴费月数不能超过截至所选退休月的生存月数');
    const minimumYear = Math.min(input.choice === 'early' ? Math.floor(chosen / 12) : Math.floor(statutory / 12), rule.finalMinimumYear);
    const minimum = rule.minimumContributionMonthsByYear[minimumYear];
    if (!Number.isSafeInteger(minimum) || minimum <= 0) throw new Error('所选退休年份缺少已核验最低缴费年限规则');
    return {
      ok: true, statutoryRetirementMonth: toMonth(statutory), statutoryAgeMonths: statutoryAge,
      chosenRetirementMonth: toMonth(chosen), chosenAgeMonths: chosen - birth,
      minimumContributionMonths: minimum, contributionSufficient: input.contributionMonths >= minimum,
      sourceIds: [...rule.sourceIds], scope: { ...rule.scope },
      formula: `原年龄 ${reform.baseAgeMonths} 月 + 延迟 ${delay} 月；每 ${reform.stepBirthMonths} 个出生月增加1月，最多 ${reform.maxDelayMonths} 月。最低年限按 ${minimumYear} 年规则。`,
      warnings: ['仅检查普通职工退休日期与最低缴费月数；原退休年龄类别须由主管部门或单位确认，不能仅按性别选择。', '不认定特殊工种、病残津贴、特殊退休、女性灵活就业身份、视同缴费或领取地；完整退休资格须经办核定。', '弹性提前应按规定提前告知单位；弹性延迟须与单位协商一致，日期符合不代表程序完成。', '远期日期以本次固定规则情景计算，政策变化需重新核验。'],
    };
  } catch (error) { return { ok: false, errors: [error instanceof Error ? error.message : '退休日期计算失败'] }; }
}

export interface VerifiedPayrollRule extends Evidence {
  id: string;
  tax: TaxRule;
  /** Dedicated verified contribution-allocation sources; employer cost does not use tax law. */
  employerCostSourceIds?: string[];
  employerCostScope?: RuleScope;
}
export interface VerifiedPayrollInput extends Omit<PayrollInput, 'contributionBases'> {
  personalContributionCents: number;
  deductiblePersonalContributionCents: number;
  employerContributionCents: number;
  contributionsConfirmed: boolean;
}
export type VerifiedTakeHomeInput = Omit<VerifiedPayrollInput, 'employerContributionCents' | 'extraEmployerCostCents'>;

/** Shared personal withholding calculation for the legacy combined and focused take-home APIs. */
function verifiedPersonalAmounts(input: VerifiedTakeHomeInput, rule: VerifiedPayrollRule) {
    applicable(rule, input.month);
    applicable(rule.tax, input.month);
    if (!input.contributionsConfirmed) throw new Error('请先核对缴费通知及合法税前扣除金额，再确认已核定实缴输入');
    for (const [label, value] of Object.entries({ gross: input.grossCents, personal: input.personalContributionCents, deductible: input.deductiblePersonalContributionCents, additional: input.additionalDeductionCents })) money(value, label);
    if (input.deductiblePersonalContributionCents > input.personalContributionCents) throw new Error('依法可扣缴费不能超过实际个人缴费');
    if (!input.prior) throw new Error('须提供同一扣缴单位本年累计预扣背景');
    for (const [label, value] of Object.entries(input.prior)) money(value, label);
    integer(input.prior.deductionMonths, 0, 11, '前期减除费用月数');
    integer(input.currentDeductionMonths, 1, 12, '本期减除费用月数');
    const months = input.prior.deductionMonths + input.currentDeductionMonths;
    if (months > Number(input.month.slice(5)) || months > 12) throw new Error('累计减除费用月数不能超过当前纳税月份');
    const taxable = Math.max(0, input.prior.grossCents + input.grossCents - input.prior.personalContributionCents - input.deductiblePersonalContributionCents - months * rule.tax.monthlyDeductionCents - input.prior.additionalDeductionCents - input.additionalDeductionCents);
    const due = progressiveTax(taxable, rule.tax);
    const withheld = Math.max(0, due - input.prior.taxPaidCents);
    const basis = combined(rule, [rule.tax]);
    return { taxable, due, withheld, basis };
}
export function calculateVerifiedPayroll(input: VerifiedPayrollInput, rule: VerifiedPayrollRule): CalculationResult {
  return guarded(() => {
    const { taxable, due, withheld, basis } = verifiedPersonalAmounts(input, rule);
    money(input.employerContributionCents, '单位实缴');
    money(input.extraEmployerCostCents, '其他单位成本');
    return { ok: true, warnings: [
      '实缴模式不推算五险一金费率或基数；缴费金额及依法可扣部分均由用户提供，需逐项对照经办通知/工资单及官方扣除条件复核。',
      '仅适用居民个人普通工资、每月5000元减除费用、无免税收入/减免税额/特殊简化预扣。不含年终奖单独计税、劳务报酬和非居民工资。',
      '单位成本为工资 + 已填单位缴费 + 自填其他单位成本；未填写的其他成本不在结果内。',
      '前期个人缴费字段须填依法可税前扣除部分；累计上下文仅限本年同一扣缴义务人。预扣负差额当期不退。',
    ], lines: [
      line('personal-total', '个人实际缴费（用户核定输入）', input.personalContributionCents, '用户已核对缴费通知的实际个人扣款；本工具不推算费率或基数', rule),
      line('personal-deductible', '本期依法可扣个人缴费（用户核定输入）', input.deductiblePersonalContributionCents, '用户按法定扣除条件核定，不将超标准缴费自动全额税前扣除', basis),
      line('employer-total', '单位实际缴费（用户核定输入）', input.employerContributionCents, '用户已核对缴费通知的单位缴费；本工具不推算费率或基数', rule),
      line('taxable-cumulative', '累计预扣应纳税所得额', taxable, 'max(0, 累计工资 − 累计依法可扣个人缴费 − 累计减除费用 − 累计其他合法扣除)', basis),
      line('withholding', '本期预扣个税', withheld, `max(0, 累计应纳税额 ${due} 分 − 已预扣 ${input.prior.taxPaidCents} 分)`, basis),
      line('net', '本期税后实发情景', input.grossCents - input.personalContributionCents - withheld, '本期税前工资 − 实际个人缴费 − 本期预扣个税', basis),
      line('company-cost', '本期单位成本情景', input.grossCents + input.employerContributionCents + input.extraEmployerCostCents, '本期税前工资 + 用户核定单位缴费 + 用户自填其他单位成本', basis),
    ] };
  });
}
export function invertVerifiedNetSalary(input: VerifiedPayrollInput, targetCents: number, bounds: { minCents: number; maxCents: number }, rule: VerifiedPayrollRule): InverseResult {
  return solveMonotoneTarget(targetCents, bounds.minCents, bounds.maxCents, (grossCents) => resultAmount(calculateVerifiedPayroll({ ...input, grossCents }, rule), 'net'));
}


export interface VerifiedEmployerCostInput {
  month: Month;
  grossCents: number;
  employerContributionCents: number;
  extraEmployerCostCents: number;
  contributionsConfirmed: boolean;
}
/** Independent employer cash-cost model. No personal deduction or tax context is constructed. */
export function calculateVerifiedEmployerCost(input: VerifiedEmployerCostInput, rule: VerifiedPayrollRule): CalculationResult {
  return guarded(() => {
    if (!rule.employerCostScope) throw new Error('缺少独立单位成本适用范围，不能套用个人税收人群条件');
    const sourceIds = rule.employerCostSourceIds;
    if (!sourceIds?.length || sourceIds.some((id) => !id.trim() || !rule.sourceIds.includes(id))) throw new Error('缺少已核验的单位社保、公积金分摊来源，暂不计算单位成本');
    const basis: Evidence = { sourceIds: [...new Set(sourceIds)], scope: { ...rule.employerCostScope } };
    applicable(basis, input.month);
    if (input.contributionsConfirmed !== true) throw new Error('请先确认单位实缴社保、公积金金额已按缴费通知核实');
    money(input.grossCents, '本期税前工资');
    money(input.employerContributionCents, '本期单位实缴');
    money(input.extraEmployerCostCents, '其他单位成本');
    const cost = input.grossCents + input.employerContributionCents + input.extraEmployerCostCents;
    if (!Number.isSafeInteger(cost)) throw new Error('单位成本合计超出精确整数分范围');
    return { ok: true, warnings: [
      '本结果是税前工资、单位实缴和已填其他成本的算术情景，不是法律定义的全部用工成本。',
      '单位实缴来自用户已核对的缴费通知，不自动推算地方费率、基数或舍入；未填入的其他成本不包含在结果中。',
      '个人缴费属于税前工资中的代扣部分，本模型不再把个人缴费重复加到单位成本；本入口不计算或假设个人个税。',
    ], lines: [
      line('gross', '本期税前工资（用户输入）', input.grossCents, '用户提供的本期税前工资金额', basis),
      line('employer-total', '单位实际缴费（用户核定输入）', input.employerContributionCents, '用户按缴费通知核定的单位社保与公积金，不含个人代扣部分', basis),
      line('employer-extra', '其他单位成本（用户情景输入）', input.extraEmployerCostCents, '用户单独列入本次情景的其他单位成本；未填部分不纳入', basis),
      line('company-cost', '本期单位现金成本情景', cost, '本期税前工资 + 已核定单位社保及公积金实缴 + 用户自填其他单位成本', basis),
    ] };
  });
}


export function calculateVerifiedTakeHome(input: VerifiedTakeHomeInput, rule: VerifiedPayrollRule): CalculationResult {
  return guarded(() => {
    const { taxable, due, withheld, basis } = verifiedPersonalAmounts(input, rule);
    return { ok: true, warnings: [
      '个人实扣和依法可扣部分分别来自用户核定输入；不把超标准缴费自动全额税前扣除，不自动计算地方费率。',
      '仅适用居民个人普通工资、每月5000元减除费用、无免税收入/减免税额/特殊简化预扣。不含年终奖单独计税、劳务报酬和非居民工资。',
      '累计背景限本年同一扣缴义务人；前期个人缴费应填依法可扣部分。预扣负差额当期不退，年度汇算另行计算。',
    ], lines: [
      line('gross', '本期税前工资（用户输入）', input.grossCents, '用户提供的本期税前工资金额', rule),
      line('personal-total', '个人实际缴费（用户核定输入）', input.personalContributionCents, '用户核定的本期个人社保、公积金实际扣款', rule),
      line('personal-deductible', '本期依法可扣个人缴费（用户核定输入）', input.deductiblePersonalContributionCents, '用户按法定条件核定，不将超标准实扣自动全额税前扣除', basis),
      line('taxable-cumulative', '累计预扣应纳税所得额', taxable, 'max(0, 累计工资 − 累计依法可扣个人缴费 − 累计减除费用 − 累计其他合法扣除)', basis),
      line('withholding', '本期预扣个税', withheld, `max(0, 累计应纳税额 ${due} 分 − 已预扣 ${input.prior.taxPaidCents} 分)`, basis),
      line('net', '本期税后实发情景', input.grossCents - input.personalContributionCents - withheld, '本期税前工资 − 个人实际缴费 − 本期预扣个税', basis),
    ] };
  });
}
export function invertVerifiedTakeHome(input: VerifiedTakeHomeInput, targetCents: number, bounds: { minCents: number; maxCents: number }, rule: VerifiedPayrollRule): InverseResult {
  return solveMonotoneTarget(targetCents, bounds.minCents, bounds.maxCents, (grossCents) => {
    // Copy only this API's fields: extra employer properties, including getters, are irrelevant.
    const candidate: VerifiedTakeHomeInput = {
      month: input.month, grossCents, personalContributionCents: input.personalContributionCents,
      deductiblePersonalContributionCents: input.deductiblePersonalContributionCents,
      additionalDeductionCents: input.additionalDeductionCents, prior: input.prior,
      currentDeductionMonths: input.currentDeductionMonths, contributionsConfirmed: input.contributionsConfirmed,
    };
    return resultAmount(calculateVerifiedTakeHome(candidate, rule), 'net');
  });
}
