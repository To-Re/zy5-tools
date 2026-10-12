import type { Evidence, ResultLine, RuleScope } from './labor-engine';

export type AutoCity = 'beijing' | 'shanghai' | 'wenzhou';
export type AutoItemId = 'pension' | 'medical' | 'unemployment' | 'housing' | 'injury';
export type AutoPayer = 'personal' | 'employer';
export interface AutoContributionItemRule extends Evidence {
  id: AutoItemId;
  payer: AutoPayer;
  /** Medical in an ordinary employee package must cover the local maternity arrangement. */
  label: string;
  base: {
    minimumCents: number;
    maximumCents: number;
    stepCents: number;
    mapping: 'prior-average-wage' | 'explicit-only';
    mappingSourceIds: string[];
  };
  /** Housing and explicitly configured injury items read their respective scenario inputs. */
  rateBps: number;
  rateInput?: 'employer-injury-confirmed';
  /** Clarifies technical input bounds versus a statutory rate limit. Required for injury input. */
  rateInputNote?: string;
  fixedCents: number;
  rounding: 'exact-cent' | 'exact-yuan' | 'half-up-yuan';
  rateRange?: { minimumBps: number; maximumBps: number; stepBps: number };
  /** Where a low-pay personal housing reduction may apply, do not infer its amount. */
  minimumGrossAfterPersonalHousingCents?: number;
}
export interface AutoContributionRule extends Evidence {
  id: string;
  city: AutoCity;
  /** Wenzhou rules select a county/district explicitly; never fall back to another area. */
  area?: string;
  items: AutoContributionItemRule[];
  /** Evidence that ordinary employees have no separate personal injury/maternity charge.
   * Required for a complete personal total; never inferred from omitted items. */
  personalZeroBurdenSourceIds: string[];
  /** Additional unresolved payments/conditions, beyond the standard item list. */
  extraMissing?: { payer: AutoPayer; reason: string }[];
}
export interface AutoContributionScenarioInput {
  city: AutoCity;
  month: string;
  grossCents: number;
  priorAverageWageCents: number;
  housingRateBps: number;
  employerInjuryRateBps?: number;
  employerInjuryRateConfirmed?: boolean;
  /** Optional final contribution bases for a pure base scenario, not agency confirmation. */
  socialBaseCents?: number;
  housingBaseCents?: number;
  wenzhouArea?: string;
  assumptions: 'ordinary-employee-no-special-cases';
}
export interface AutoMissing { payer: AutoPayer; itemId: AutoItemId | 'scope' | 'personal-zero-burden'; reason: string }
export interface AutoContributionBranch {
  status: 'complete' | 'partial' | 'unavailable';
  lines: ResultLine[];
  missing: AutoMissing[];
}
export interface AutoContributionScenarioResult {
  lines: ResultLine[];
  personal: AutoContributionBranch;
  employer: AutoContributionBranch;
  coverage: { ruleId: string; sourceIds: string[]; scope: RuleScope }[];
  missing: AutoMissing[];
  assumptions: string[];
}

const MAX_CENTS = 100_000_000_000;
const REQUIRED: Record<AutoPayer, AutoItemId[]> = {
  personal: ['pension', 'medical', 'unemployment', 'housing'],
  employer: ['pension', 'medical', 'unemployment', 'housing', 'injury'],
};
const LABELS: Record<AutoItemId, string> = { pension: '养老保险', medical: '医疗及当地生育安排', unemployment: '失业保险', housing: '住房公积金', injury: '工伤保险' };
const CITY_LABELS: Record<AutoCity, string> = { beijing: '北京', shanghai: '上海', wenzhou: '温州' };
function integer(value: number, min: number, max: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label}须为支持范围内的整数，不自动取整或补零`);
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function validateEvidence(value: Evidence, month: string): void {
  if (!value.sourceIds?.length || value.sourceIds.some((id) => !id?.trim()) || !value.scope?.region?.trim() || !value.scope.population?.trim()) throw new Error('缺少完整地区、人群或官方来源');
  const { validFrom, validTo, verifiedOn } = value.scope;
  if (![validFrom, validTo, verifiedOn].every(validDate) || validFrom > validTo) throw new Error('规则有效期或核验日无效');
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  if (`${month}-01` < validFrom || `${month}-${lastDay}` > validTo) throw new Error('所选完整月份没有适用规则；不使用其他期间或月中变更规则');
}
function sources(ids: string[], parent: string[]): void {
  if (!ids?.length || ids.some((id) => !id?.trim() || !parent.includes(id))) throw new Error('字段来源缺失或未登记在地区规则中');
}
function amountLine(id: string, label: string, cents: number, formula: string, evidence: Evidence): ResultLine {
  if (!Number.isSafeInteger(cents)) throw new Error('结果超过安全整数分范围');
  return { id, label, amountCents: cents, formula, sourceIds: [...new Set(evidence.sourceIds)], scope: { ...evidence.scope } };
}
function personalBalance(grossCents: number, contributionCents: number, evidence: Evidence): ResultLine {
  return contributionCents > grossCents
    ? amountLine('personal-cash-shortfall', '工资不足支付个人缴费的现金缺口', contributionCents - grossCents,
      '完整个人缴费情景合计 − 方案税前月薪；需另补现金，未假设已扣足，不输出负数到账工资', evidence)
    : amountLine('before-tax', '扣个人缴费后、个税前余额', grossCents - contributionCents,
      '方案税前月薪 − 个人完整缴费情景合计；尚未扣个人所得税，不是到手工资', evidence);
}
function unavailable(reason: string, assumptions: string[]): AutoContributionScenarioResult {
  const personal: AutoContributionBranch = { status: 'unavailable', lines: [], missing: [{ payer: 'personal', itemId: 'scope', reason }] };
  const employer: AutoContributionBranch = { status: 'unavailable', lines: [], missing: [{ payer: 'employer', itemId: 'scope', reason }] };
  return { lines: [], personal, employer, coverage: [], missing: [...personal.missing, ...employer.missing], assumptions };
}

/** Pure scenario layer. Does not claim that parameters, eligibility or bases are agency-confirmed.
 * No historical period, withholding tax, tax deduction eligibility or resident regime is inferred. */
export function calculateAutoContributionScenario(input: AutoContributionScenarioInput, rules: AutoContributionRule[] = []): AutoContributionScenarioResult {
  const assumptions = [
    '持续正常在职的普通企业职工（非新入职或调入特殊月）、普通缴存渠道、无机关事业或特殊身份、无降缓缴/个人减免/补退/补缴；这是所选计算方案，不是经办资格核定。',
    '仅按所选月规则计算。上年度月均工资与当前月薪是两个独立参数；默认相同时只是稳定工资假设，不是法律要求。',
    '公积金比例是用户选择的方案参数，不是该城市统一比例。个人缴费不自动等于税前可扣额，本入口不计算个税或税后到手。',
    '显式基数表示纯基数方案，必须在规则限额及精度内；未填时只有具备工资映射来源的项目才按上年月均工资限额计算。',
  ];
  try {
    if (!Object.prototype.hasOwnProperty.call(CITY_LABELS, input.city)) throw new Error('城市不在已研究范围');
    if (input.month !== '2026-10') throw new Error('当前自动缴费情景仅核验2026年10月，不回填历史或延展未来');
    if (input.assumptions !== 'ordinary-employee-no-special-cases') throw new Error('请选择明确的普通企业职工无特殊情形方案；未知身份不能默认普通情形');
    integer(input.grossCents, 0, MAX_CENTS, '税前月薪（分）');
    if (input.city === 'wenzhou' && !input.wenzhouArea?.trim()) return compareCoveredAreas(input, rules, assumptions);
    const matches = rules.filter((rule) => rule.city === input.city && (input.city !== 'wenzhou' ? !rule.area : rule.area === input.wenzhouArea));
    if (!matches.length) throw new Error(`${CITY_LABELS[input.city]}${input.wenzhouArea ? ` ${input.wenzhouArea}` : ''}当前没有已准入的自动缴费规则；已核定金额复核可另用，但不冒充自动计算`);
    if (matches.length !== 1) throw new Error('地区情景规则存在重复或歧义，暂不自动选择');
    const rule = matches[0];
    if (!rule.id?.trim() || !Array.isArray(rule.items)) throw new Error('地区规则标识或项目列表不完整');
    validateEvidence(rule, input.month);
    if (rule.extraMissing && (!Array.isArray(rule.extraMissing) || rule.extraMissing.some((item) => !['personal', 'employer'].includes(item.payer) || !item.reason?.trim()))) throw new Error('地区额外缺项定义无效');
    const coverage: AutoContributionScenarioResult['coverage'] = [];
    const branches = {} as Record<AutoPayer, AutoContributionBranch>;
    for (const payer of ['personal', 'employer'] as const) {
      const rows: ResultLine[] = [];
      const missing: AutoMissing[] = (rule.extraMissing ?? []).filter((item) => item.payer === payer).map((item) => ({ payer, itemId: 'scope', reason: item.reason }));
      for (const id of REQUIRED[payer]) {
        try {
          const items = rule.items.filter((item) => item.id === id && item.payer === payer);
          if (items.length !== 1) throw new Error(items.length ? '同一分项规则存在歧义' : '缺少该分项的适用费率、基数或金额处理依据；未知不按零处理');
          const item = items[0];
          validateEvidence(item, input.month);
          sources(item.sourceIds, rule.sourceIds);
          if (!item.label?.trim()) throw new Error('项目名称缺失');
          const baseRule = item.base;
          integer(baseRule.minimumCents, 0, MAX_CENTS, '基数下限');
          integer(baseRule.maximumCents, baseRule.minimumCents, MAX_CENTS, '基数上限');
          integer(baseRule.stepCents, 1, MAX_CENTS, '支持的基数精度');
          if (!['prior-average-wage', 'explicit-only'].includes(baseRule.mapping)) throw new Error('基数映射方式未核验');
          const explicitBase = id === 'housing' ? input.housingBaseCents : input.socialBaseCents;
          let base: number;
          let baseFormula: string;
          let mappingSources: string[] = [];
          if (explicitBase !== undefined) {
            integer(explicitBase, baseRule.minimumCents, baseRule.maximumCents, '显式基数情景（分）');
            base = explicitBase;
            baseFormula = `用户显式基数方案 ${base} 分，不宣称经办核定`;
          } else {
            if (baseRule.mapping === 'explicit-only') throw new Error('尚无工资到该项目缴费基数的完整映射依据；仅支持另填显式基数的纯基数方案');
            sources(baseRule.mappingSourceIds, rule.sourceIds);
            mappingSources = baseRule.mappingSourceIds;
            integer(input.priorAverageWageCents, 0, MAX_CENTS, '方案上年度月均工资（分）');
            // Input precision is a product restriction, not a silently applied statutory rounding.
            if (input.priorAverageWageCents % baseRule.stepCents !== 0) throw new Error('上年度月均工资不在支持精度内；不猜测申报工资取整');
            base = Math.min(baseRule.maximumCents, Math.max(baseRule.minimumCents, input.priorAverageWageCents));
            baseFormula = `方案上年度月均 ${input.priorAverageWageCents} 分，依 ${baseRule.minimumCents}—${baseRule.maximumCents} 分上下限得基数 ${base} 分`;
          }
          if (base % baseRule.stepCents !== 0) throw new Error('基数不在本版支持精度内，不自动改值');
          let rate = item.rateBps;
          if (item.rateInput && !(id === 'injury' && payer === 'employer')) throw new Error('核定工伤费率输入不能用于其他缴费项目');
          if (id === 'injury') {
            if (payer !== 'employer' || item.rateInput !== 'employer-injury-confirmed' || !item.rateInputNote?.trim()) throw new Error('工伤仅支持企业当期经办核定最终费率，不使用默认行业费率');
            if (input.employerInjuryRateConfirmed !== true || input.employerInjuryRateBps === undefined) throw new Error('请提供并确认企业当期经办核定的最终工伤费率，包含适用浮动与减征；不按行业猜测');
            const range = item.rateRange;
            if (!range) throw new Error('缺少工伤核定费率的已审支持精度');
            integer(range.minimumBps, 0, 10000, '工伤费率支持下限');
            integer(range.maximumBps, range.minimumBps, 10000, '工伤费率支持上限');
            integer(range.stepBps, 1, 10000, '工伤费率支持精度');
            integer(input.employerInjuryRateBps, range.minimumBps, range.maximumBps, '当期核定工伤费率');
            if (input.employerInjuryRateBps % range.stepBps !== 0) throw new Error('工伤费率不在已审精度内，不自动修约核定费率');
            rate = input.employerInjuryRateBps;
          }
          if (id === 'housing') {
            const range = item.rateRange;
            if (!range) throw new Error('缺少公积金比例支持范围');
            integer(range.minimumBps, 1, 10000, '公积金比例下限');
            integer(range.maximumBps, range.minimumBps, 10000, '公积金比例上限');
            integer(range.stepBps, 1, 10000, '公积金比例精度');
            integer(input.housingRateBps, range.minimumBps, range.maximumBps, '公积金方案比例');
            if (input.housingRateBps % range.stepBps !== 0) throw new Error('公积金比例不在已支持精度内');
            rate = input.housingRateBps;
          }
          integer(rate, 0, 10000, '分项比例');
          integer(item.fixedCents, 0, MAX_CENTS, '固定缴费额（分）');
          const numerator = BigInt(base) * BigInt(rate);
          let amount: number;
          if (item.rounding === 'exact-cent') {
            if (numerator % BigInt(10000) !== BigInt(0)) throw new Error('结果存在分以下尾差，尚无已核验地方舍入依据；此项暂不计算');
            amount = Number(numerator / BigInt(10000));
          } else if (id === 'housing' && item.rounding === 'exact-yuan') {
            if (numerator % BigInt(1_000_000) !== BigInt(0)) throw new Error('公积金结果不是整元，地方取整口径尚未核验；不借用其他城市舍入规则');
            amount = Number(numerator / BigInt(10000));
          } else if (id === 'housing' && item.rounding === 'half-up-yuan') {
            amount = Number(((numerator * BigInt(2) + BigInt(1_000_000)) / BigInt(2_000_000)) * BigInt(100));
          } else throw new Error('该分项金额处理方式未准入');
          amount += item.fixedCents;
          if (payer === 'personal' && id === 'housing' && item.minimumGrossAfterPersonalHousingCents !== undefined) {
            integer(item.minimumGrossAfterPersonalHousingCents, 0, MAX_CENTS, '个人减缴判断门槛');
            integer(input.priorAverageWageCents, 0, MAX_CENTS, '低薪范围判断所需上年度月均工资（分）');
            if (input.grossCents - amount < item.minimumGrossAfterPersonalHousingCents || input.priorAverageWageCents - amount < item.minimumGrossAfterPersonalHousingCents) throw new Error('当前工资或上年度月均工资扣除标准个人公积金后低于最低工资门槛，可能涉及个人减缴；本版保守排除此范围，不认定两种工资均为法定判断口径');
          }
          const basis: Evidence = { sourceIds: [...new Set([...item.sourceIds, ...mappingSources])], scope: { ...item.scope } };
          rows.push(amountLine(`${payer}-${id}`, `${payer === 'personal' ? '个人' : '单位'}${item.label}（当前月情景）`, amount,
            `${baseFormula} × ${rate}/10000；${item.rounding === 'half-up-yuan' ? '每方独立四舍五入到整元' : item.rounding === 'exact-yuan' ? '乘积恰好整元，不涉及未核地方取整' : '乘积恰好到分，无未知尾差舍入'}；另加固定 ${item.fixedCents} 分${id === 'injury' ? `；企业提供并确认的核定最终费率；${item.rateInputNote}` : ''}`, basis));
          coverage.push({ ruleId: `${rule.id}/${payer}/${id}`, sourceIds: basis.sourceIds, scope: { ...item.scope } });
        } catch (error) {
          missing.push({ payer, itemId: id, reason: `${LABELS[id]}：${error instanceof Error ? error.message : '暂不可计算'}` });
        }
      }
      if (payer === 'personal') {
        try { sources(rule.personalZeroBurdenSourceIds, rule.sourceIds); }
        catch { missing.push({ payer, itemId: 'personal-zero-burden', reason: '缺少普通职工工伤/生育无单独个人缴费的依据，不能把省略项目当成零并给个人完整总额' }); }
      }
      const status = missing.length === 0 ? 'complete' : rows.length ? 'partial' : 'unavailable';
      if (rows.length) {
        const total = rows.reduce((sum, row) => sum + row.amountCents, 0);
        const basis: Evidence = { sourceIds: [...new Set([...rows.flatMap((row) => row.sourceIds), ...(payer === 'personal' && status === 'complete' ? rule.personalZeroBurdenSourceIds : [])])], scope: { ...rule.scope } };
        if (status === 'complete') {
          rows.push(amountLine(`${payer}-total`, `${payer === 'personal' ? '个人' : '单位'}当前月缴费情景合计`, total, '已列分项按各自金额口径计算后相加；只适用当前月份及普通方案', basis));
          rows.push(payer === 'personal'
            ? personalBalance(input.grossCents, total, basis)
            : amountLine('company-cost', '工资与单位缴费成本情景', input.grossCents + total, '方案税前月薪 + 单位完整缴费情景合计；未含其他用工支出', basis));
        } else rows.push(amountLine(`${payer}-known-subtotal`, `${payer === 'personal' ? '个人' : '单位'}已计算项目小计（不完整）`, total, '仅以上已算分项相加，缺失项目未知，不用于推算完整工资余额或公司成本', basis));
      }
      branches[payer] = { status, lines: rows, missing };
    }
    return { lines: [...branches.personal.lines, ...branches.employer.lines], ...branches, coverage,
      missing: [...branches.personal.missing, ...branches.employer.missing], assumptions };
  } catch (error) { return unavailable(error instanceof Error ? error.message : '当前月缴费方案计算失败', assumptions); }
}


/** An omitted county is not assigned a default. Only results equal in every registered
 * Wenzhou area survive, with the covered area list and all evidence kept visible. */
function compareCoveredAreas(input: AutoContributionScenarioInput, rules: AutoContributionRule[], assumptions: string[]): AutoContributionScenarioResult {
  const candidates = rules.filter((rule) => rule.city === 'wenzhou');
  const areas = [...new Set(candidates.map((rule) => rule.area).filter((area): area is string => !!area?.trim()))];
  if (!areas.length || candidates.some((rule) => !rule.area?.trim())) return unavailable('温州已覆盖县区的规则目录尚未齐备，不能推断地区或使用默认城区', assumptions);
  const areaLabels = areas.map((area) => [...new Set(candidates.filter((rule) => rule.area === area).map((rule) => rule.scope.region))].join(' / '));
  const results = areas.map((area) => calculateAutoContributionScenario({ ...input, wenzhouArea: area }, rules));
  const branches = {} as Record<AutoPayer, AutoContributionBranch>;
  for (const payer of ['personal', 'employer'] as const) {
    const lines: ResultLine[] = [];
    const missing: AutoMissing[] = [];
    for (const itemId of REQUIRED[payer]) {
      const rowId = `${payer}-${itemId}`;
      const matches = results.map((result) => result[payer].lines.find((row) => row.id === rowId));
      if (matches.some((row) => !row)) {
        const reasons = results.flatMap((result, i) => result[payer].missing.filter((item) => item.itemId === itemId || item.itemId === 'scope').map((item) => `${areaLabels[i]}：${item.reason}`));
        missing.push({ payer, itemId, reason: `已覆盖县区尚未全部支持此项；${reasons.join('；')}` });
        continue;
      }
      const rows = matches as ResultLine[];
      if (!rows.every((row) => row.amountCents === rows[0].amountCents)) {
        missing.push({ payer, itemId, reason: `${LABELS[itemId]}在已覆盖县区的方案金额不同，请选择所在县区；不代选城区或平均不同规则` });
        continue;
      }
      const scope: RuleScope = {
        region: `温州已覆盖区域同额（${areaLabels.join('、')}）`,
        population: [...new Set(rows.map((row) => row.scope.population))].join('；'),
        validFrom: rows.map((row) => row.scope.validFrom).sort().at(-1)!,
        validTo: rows.map((row) => row.scope.validTo).sort()[0],
        verifiedOn: rows.map((row) => row.scope.verifiedOn).sort()[0],
      };
      lines.push(amountLine(rowId, `${rows[0].label}（已覆盖县区同额）`, rows[0].amountCents,
        rows.map((row, index) => `${areaLabels[index]}：${row.formula}`).join('；'),
        { sourceIds: [...new Set(rows.flatMap((row) => row.sourceIds))], scope }));
    }
    if (payer === 'personal' && results.some((result) => result.personal.missing.some((item) => item.itemId === 'personal-zero-burden'))) missing.push({ payer, itemId: 'personal-zero-burden', reason: '部分区域缺少个人无需单缴工伤/生育的依据' });
    for (let index = 0; index < results.length; index++) {
      for (const item of results[index][payer].missing.filter((entry) => entry.itemId === 'scope')) missing.push({ ...item, reason: `${areaLabels[index]}：${item.reason}` });
    }
    const status = missing.length ? (lines.length ? 'partial' : 'unavailable') : 'complete';
    if (lines.length) {
      const total = lines.reduce((sum, row) => sum + row.amountCents, 0);
      const sourceIds = [...new Set([...lines.flatMap((row) => row.sourceIds), ...(status === 'complete' ? results.flatMap((result) => result[payer].lines.find((row) => row.id === `${payer}-total`)?.sourceIds ?? []) : [])])];
      const basis: Evidence = { sourceIds, scope: {
        ...lines[0].scope,
        validFrom: lines.map((row) => row.scope.validFrom).sort().at(-1)!,
        validTo: lines.map((row) => row.scope.validTo).sort()[0],
        verifiedOn: lines.map((row) => row.scope.verifiedOn).sort()[0],
      } };
      if (status === 'complete') {
        lines.push(amountLine(`${payer}-total`, `${payer === 'personal' ? '个人' : '单位'}当前月缴费合计（已覆盖县区同额）`, total, '所有已覆盖县区逐项计算结果相同，再将各项目相加；不认定实际所在区县', basis));
        lines.push(payer === 'personal'
          ? personalBalance(input.grossCents, total, basis)
          : amountLine('company-cost', '工资与单位缴费成本情景', input.grossCents + total, '方案税前工资 + 完整单位缴费情景合计；不含其他用工支出', basis));
      } else lines.push(amountLine(`${payer}-known-subtotal`, `${payer === 'personal' ? '个人' : '单位'}已计算项目小计（不完整）`, total, '仅已覆盖县区同额且已计算的项目相加；缺项不按零处理', basis));
    }
    branches[payer] = { status, lines, missing };
  }
  const visibleIds = new Set([...branches.personal.lines, ...branches.employer.lines].map((row) => row.id));
  return { ...branches, lines: [...branches.personal.lines, ...branches.employer.lines],
    missing: [...branches.personal.missing, ...branches.employer.missing],
    coverage: results.flatMap((result) => result.coverage).filter((item) => {
      const parts = item.ruleId.split('/'); return visibleIds.has(`${parts.at(-2)}-${parts.at(-1)}`);
    }),
    assumptions: [...assumptions, `未选择区县：仅比较已登记覆盖区域 ${areaLabels.join('、')}；只有这些区域结果完全相同的项目才显示，不认定实际地区，也不外推未登记区域。`],
  };
}
