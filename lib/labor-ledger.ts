import type { CalculationResult, ResultLine } from './labor-engine';
import { LABOR_SOURCES } from './labor-rules.ts';

export interface VerifiedContributionSegment {
  id: string; region: string; regime: 'employee' | 'flexible' | 'resident';
  from: string; to: string; personalMonthlyCents: number; employerMonthlyCents: number;
}
function month(value: string) {
  if (!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('请填写1900—2099范围内有效的起止年月');
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1;
}
function amount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10000000000) throw new Error('每月金额必须是非负整数分且不超过1亿元');
}
/** Budget arithmetic over user-supplied amounts, never a reconstruction of contribution rights. */
export function calculateVerifiedContributionPlan(segments: VerifiedContributionSegment[], confirmed: boolean): CalculationResult {
  try {
    if (!confirmed) throw new Error('请先确认月额来自缴费记录或明确预算假设，且本表不核定缴费年限、参保资格或待遇');
    if (segments.length < 1 || segments.length > 60) throw new Error('请填写1—60段预算');
    const lines: ResultLine[] = [];
    const occupied = new Set<number>();
    const ids = new Set<string>();
    const sums = { employee: { personal: 0, employer: 0 }, flexible: { personal: 0, employer: 0 } };
    const used = new Set<'employee' | 'flexible'>();
    for (const segment of segments) {
      if (!segment.id || ids.has(segment.id)) throw new Error('分段标识缺失或重复');
      ids.add(segment.id);
      if (!segment.region.trim() || segment.region.length > 40) throw new Error('请填写每段地区（不超过40字）');
      if (segment.regime !== 'employee' && segment.regime !== 'flexible') throw new Error('城乡居民及其他制度未开放，不混入职工/灵活就业预算');
      const from = month(segment.from), to = month(segment.to);
      if (to < from || to - from >= 720) throw new Error('分段起止不能倒置，每段最长60年');
      for (let m = from; m <= to; m++) {
        if (occupied.has(m)) throw new Error('分段月份重叠，不能把同一月重复累计；请拆分或合并记录');
        occupied.add(m);
      }
      if (occupied.size > 720) throw new Error('全部预算合计最长720个月');
      amount(segment.personalMonthlyCents); amount(segment.employerMonthlyCents);
      if (segment.regime === 'flexible' && segment.employerMonthlyCents !== 0) throw new Error('灵活就业自行承担的缴费请填个人月额，不能虚构单位缴费');
      const months = to - from + 1;
      const sourceIds = ['social-insurance-law'];
      if (sourceIds.some((id) => !LABOR_SOURCES[id])) throw new Error('支出归属依据缺失，拒算');
      const scope = { region: segment.region, population: `${segment.regime === 'employee' ? '职工' : '灵活就业'}用户填入月额的算术预算；不自动判断参保资格、历史规则或个人账户入账`, validFrom: `${segment.from}-01`, validTo: `${segment.to}（含整月）`, verifiedOn: '2026-10-12' };
      for (const party of ['personal', 'employer'] as const) {
        if (segment.regime === 'flexible' && party === 'employer') continue;
        const monthly = party === 'personal' ? segment.personalMonthlyCents : segment.employerMonthlyCents;
        const total = monthly * months;
        sums[segment.regime][party] += total;
        lines.push({ id: `${segment.id}-${party}`, label: `${segment.region} ${segment.from}—${segment.to} ${party === 'personal' ? '个人' : '单位'}预算（${months}月）`, amountCents: total, formula: `用户填写月额 ${monthly} 分 × 首尾均含 ${months} 月；按分相加，不推算费率或账户记账`, sourceIds, scope });
      }
      used.add(segment.regime);
    }
    for (const regime of used) for (const party of ['personal', 'employer'] as const) {
      if (regime === 'flexible' && party === 'employer') continue;
      lines.push({ id: `ledger-${regime}-${party}`, label: `${regime === 'employee' ? '职工' : '灵活就业'}${party === 'personal' ? '个人' : '单位'}预算合计`, amountCents: sums[regime][party], formula: '同类预算分段金额相加；不是缴费权益或个人账户余额', sourceIds: ['social-insurance-law'], scope: { region: '所填地区（仅预算加总）', population: '不核定跨区转移、退休地或法定缴费年限', validFrom: '用户填写的预算起月', validTo: '用户填写的预算止月', verifiedOn: '2026-10-12' } });
    }
    return { ok: true, lines, warnings: ['月额由用户从经办记录填入或作为明确预算假设；本工具未核定各地基数、比例、舍入及参保资格。未来月额恒定只是预算假设。', '此表月份是预算月份，不等于经办认定的实际/视同缴费月数；单位、个人、灵活就业分别展示，不把全部支出记入养老个人账户。', '本表不会把跨地区养老金分别计算相加，也不会自动把预算转成退休资格或养老金金额。', '卡片中的起止范围为所填预算期间，不是引用法规的有效期；法规时间与人群请查来源页。'] };
  } catch (error) { return { ok: false, errors: [error instanceof Error ? error.message : '预算无法计算'] }; }
}
