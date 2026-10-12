'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  calculateAnnualTax,
  calculateVerifiedTakeHome, invertVerifiedTakeHome, calculateRetirement, calculateVerifiedEmployerCost,
  calculatePensionScenario, solvePensionTarget,
  type CalculationResult, type InverseResult, type PensionInput,
  type RuleScope, type RetirementCategory,
} from '@/lib/labor-engine';
import {
  LABOR_RULE_VERSION, LABOR_SOURCES, LABOR_COVERAGE, LABOR_RULE_FIELDS,
  LABOR_TAX_RULE, LABOR_PENSION_RULES, LABOR_VERIFIED_PAYROLL_RULE, LABOR_RETIREMENT_RULE, LABOR_BENEFIT_PROVINCE_RULE, LABOR_PENSION_CONTRIBUTION_ITEMS,
} from '@/lib/labor-rules';
import { calculateVerifiedContributionPlan, type VerifiedContributionSegment } from '@/lib/labor-ledger';
import { calculateBenefitProvince, type BenefitProvinceInput, type BenefitProvinceResult } from '@/lib/labor-benefit-province';
import { calculatePensionContributionItem } from '@/lib/labor-contribution-item';
import styles from './labor-tool.module.css';

const DISCLAIMER = 'AI 辅助制作，仅供参考；不构成税务、社保或法律意见。请自行查阅所附官方规则并复核计算，实际以主管部门核定为准';
const money = (cents: number) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
function cents(value: string, label: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error(`${label}：请输入非负金额，最多两位小数。`);
  const result = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(result)) throw new Error(`${label}：金额超出可计算范围。`);
  return result;
}
function numberValue(value: string, label: string, integer = false) {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) throw new Error(`${label}：请输入非负数字。`);
  const result = Number(value);
  if (!Number.isFinite(result) || (integer && !Number.isSafeInteger(result))) throw new Error(`${label}：请输入有效${integer ? '整数' : '数字'}。`);
  return result;
}
function errorResult(error: unknown): CalculationResult { return { ok: false, errors: [error instanceof Error ? error.message : '输入无法计算，请检查。'] }; }

const SHORT_SOURCE_NAMES: Record<string, string> = { 'bj-contribution-2026': '北京2026缴费基数', 'bj-contribution-rates-2026': '北京养老缴费比例', 'zj-contribution-base-2026': '浙江2026缴费基数', 'zj-contribution-explanation-2026': '浙江缴费口径说明', 'zj-flexible-population': '浙江灵活就业参保条件', 'sh-contribution-base-2026': '上海2026缴费基数', 'sh-flexible-pension': '上海灵活就业养老比例', 'sh-flexible-population': '上海灵活就业参保条件', 'housing-fund-2026': '住房公积金管理条例', 'iit-law': '个税法', 'iit-withholding': '累计预扣规则', 'iit-table': '官方税率表', 'social-insurance-law': '社保法', 'sh-pension-2026': '上海养老金办法', 'pension-divisor': '计发月数表', 'pension-transfer': '领取地规则', 'retirement-reform': '延退规则', 'retirement-flexible': '弹性退休规则' };
function SourceLinks({ ids, compact = false }: { ids: string[]; compact?: boolean }) {
  return <div className={styles.sources}>{[...new Set(ids)].map((id) => {
    const source = LABOR_SOURCES[id];
    return source ? <a key={id} href={source.url} title={source.title} target="_blank" rel="noreferrer">{compact ? (SHORT_SOURCE_NAMES[id] ?? `${source.authority}原文`) : source.title} ↗</a> : <span key={id}>依据缺失：{id}</span>;
  })}</div>;
}
function AIHint() {
  return <div className={styles.aiHint}><span>AI 辅助制作，仅供参考；实际以主管部门核定为准。</span><details><summary>完整提示</summary><p>{DISCLAIMER}。未来养老金为固定假设情景，不保证未来待遇。</p></details></div>;
}
function Field({ label, value, onChange, hint, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; hint?: ReactNode; type?: string }) {
  const id = useId();
  return <label className={styles.field} htmlFor={id}><span>{label}</span><input id={id} type={type} inputMode={type === 'text' ? 'decimal' : undefined} autoComplete="off" value={value} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(event) => onChange(event.target.value)} />{hint && <small id={`${id}-hint`}>{hint}</small>}</label>;
}
function Check({ children, checked, onChange }: { children: ReactNode; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className={styles.check}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{children}</span></label>;
}
function useResultFocus(result: unknown, enabled = true) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!result || !enabled) return;
    const element = ref.current;
    if (!element || element.closest('[hidden]')) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [result, enabled]);
  return ref;
}
function ErrorSummary({ errors }: { errors: string[] }) {
  const ref = useResultFocus(errors);
  return <section ref={ref} tabIndex={-1} className={`${styles.error} ${styles.result}`} role="alert"><h2>还差一步，暂不能计算</h2>{errors.map((error, index) => <p key={index}>{error}</p>)}<p className={styles.subtle}>请按提示补充或修正上方信息；不知道的值不要用 0 代替。</p></section>;
}
function primarySources(ids: string[], resultId: string) {
  const preferred = resultId === 'net' || resultId === 'withholding' || resultId.startsWith('annual-') ? ['iit-withholding', 'iit-law'] : resultId.startsWith('pension-') && !resultId.startsWith('pension-contribution-') ? ['sh-pension-2026', 'pension-divisor'] : ids;
  const filtered = preferred.filter((id) => ids.includes(id));
  return (filtered.length ? filtered : ids).slice(0, 2);
}
function CalculationView({ result, title = '计算结果', primaryIds, focusResult = true }: { result: CalculationResult | null; title?: string; primaryIds?: string[]; focusResult?: boolean }) {
  const ref = useResultFocus(result?.ok ? result : null, focusResult);
  const titleId = useId();
  if (!result) return null;
  if (!result.ok) return <ErrorSummary errors={result.errors} />;
  const primary = primaryIds ? primaryIds.flatMap((id) => result.lines.filter((line) => line.id === id)) : result.lines.filter((line) => line.id.startsWith('pension-contribution-') || line.id.startsWith('ledger-'));
  const visible = primary.length ? primary : result.lines.slice(-1);
  return <section ref={ref} tabIndex={-1} className={`${styles.panel} ${styles.result} ${styles.resultSummary}`} aria-labelledby={titleId}>
    <p className={styles.resultStatus} role="status">计算完成</p><h2 id={titleId}>{title}</h2>
    <div className={styles.resultGrid}>{visible.map((line) => <article className={styles.resultCard} key={line.id}><span>{line.label}</span><strong>¥ {money(line.amountCents)}</strong><SourceLinks compact ids={primarySources(line.sourceIds, line.id)} /></article>)}</div>
    {result.lines.some((line) => line.id === 'pension-monthly') && <p className={styles.subtle}>仅为 2026 年固定退休情景，不保证未来金额；累计窗口不是法定发放截止年限。</p>}
    <AIHint />
    <details className={styles.details}><summary>计算明细、假设与全部规则依据</summary><p className={styles.subtle}>规则版本 {LABOR_RULE_VERSION} · 金额单位：人民币元</p>{result.warnings.map((warning, index) => <p className={styles.subtle} key={index}>{warning}</p>)}
      {result.lines.map((line) => <article className={styles.detailLine} key={line.id}><div><strong>{line.label}</strong><b>¥ {money(line.amountCents)}</b></div><p>{line.formula}</p><p>{line.scope.region} · {line.scope.population}<br />{title.includes('预算') ? '预算期间（非法规有效期）' : '规则有效期'}：{line.scope.validFrom} 至 {line.scope.validTo} · 核验日：{line.scope.verifiedOn}</p><SourceLinks ids={line.sourceIds} /></article>)}
    </details>
  </section>;
}
function InverseView({ result, label, sourceIds, scope, formula }: { result: InverseResult | null; label: string; sourceIds: string[]; scope?: RuleScope; formula: string }) {
  const ref = useResultFocus(result);
  if (!result) return null;
  return <section ref={ref} tabIndex={-1} className={`${styles.panel} ${styles.result} ${styles.resultSummary}`}><h2>{label}</h2>
    {result.status === 'blocked' || result.status === 'none' ? <div className={styles.error} role="alert"><strong>{result.status === 'none' ? '当前条件下无解' : '还不能反推'}</strong><p>{result.error ?? '目标超出固定假设和搜索边界对应的可达范围。'}</p></div> : <div className={styles.resultCard}><span>{result.status === 'unique' ? '唯一的整数分解' : '符合目标的金额区间（多个解）'}</span><strong>¥ {money(result.minimum!)}{result.maximum !== result.minimum ? ` 至 ¥ ${money(result.maximum!)}` : ''}</strong></div>}
    <SourceLinks compact ids={sourceIds.filter((id) => ['iit-withholding', 'iit-law', 'sh-pension-2026'].includes(id)).slice(0, 2)} /><AIHint />
    <details className={styles.details}><summary>固定条件、可达范围与反推依据</summary>{result.attainableMinimumCents !== undefined && <p className={styles.subtle}>搜索边界对应可达结果：¥ {money(result.attainableMinimumCents)} 至 ¥ {money(result.attainableMaximumCents!)}。</p>}<p className={styles.subtle}>{formula}</p>{scope && <p className={styles.subtle}>{scope.region} · {scope.population}<br />规则有效期：{scope.validFrom} 至 {scope.validTo} · 核验日：{scope.verifiedOn}</p>}<SourceLinks ids={sourceIds} /></details>
  </section>;
}
function valueWasEdited(event: { target: EventTarget }, isDemo: boolean) {
  return isDemo || !(event.target instanceof HTMLInputElement) || event.target.type !== 'checkbox';
}
function DemoLabel({ active }: { active: boolean }) { return active ? <p className={styles.demoLabel}>当前是虚构示例；修改任一参数后，需重新确认本人适用条件。</p> : null; }
const payrollBlank = { month: '2026-10', gross: '', additional: '0', priorGross: '', priorPersonal: '', priorAdditional: '', priorTax: '', priorMonths: '', currentMonths: '', history: '', target: '', maxGross: '1000000', personal: '', deductible: '' };
type PayrollForm = typeof payrollBlank;
function PayrollPanel() {
  const [form, setForm] = useState<PayrollForm>(payrollBlank);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [inverse, setInverse] = useState<InverseResult | null>(null);
  const [mode, setMode] = useState<'gross' | 'net'>('gross');
  const [ordinaryConfirmed, setOrdinaryConfirmed] = useState(false);
  const [contributionsConfirmed, setContributionsConfirmed] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const change = (key: keyof PayrollForm, value: string) => setForm((old) => ({ ...old, [key]: value }));
  function calculate(values = form, ordinary = ordinaryConfirmed, confirmed = contributionsConfirmed, demo = isDemo) {
    setInverse(null); setIsDemo(demo);
    try {
      if (!values.history || values.history === 'unknown') throw new Error('先确认本单位本年此前是否已经发薪；不知道累计背景时，不能按 0 计算税后工资。');
      if (!ordinary) throw new Error('请确认居民个人普通工资累计预扣的适用条件，不含特殊预扣、免税或减免处理。');
      const verified = {
        month: values.month, grossCents: mode === 'net' ? 0 : cents(values.gross, '本期税前工资'),
        personalContributionCents: cents(values.personal, '个人实际缴费'), deductiblePersonalContributionCents: cents(values.deductible, '个人依法可扣缴费'), contributionsConfirmed: confirmed,
        additionalDeductionCents: cents(values.additional, '其他合法扣除'),
        prior: values.history === 'first' ? { grossCents: 0, personalContributionCents: 0, additionalDeductionCents: 0, taxPaidCents: 0, deductionMonths: 0 } : {
          grossCents: cents(values.priorGross, '此前累计工资'), personalContributionCents: cents(values.priorPersonal, '此前累计可扣缴费'), additionalDeductionCents: cents(values.priorAdditional, '此前累计其他扣除'), taxPaidCents: cents(values.priorTax, '此前已预缴税'), deductionMonths: numberValue(values.priorMonths, '此前基本减除费用月数', true),
        }, currentDeductionMonths: numberValue(values.currentMonths, '本期新增减除费用月数', true),
      };
      if (mode === 'gross') setResult(calculateVerifiedTakeHome(verified, LABOR_VERIFIED_PAYROLL_RULE));
      else {
        const next = invertVerifiedTakeHome(verified, cents(values.target, '目标税后工资'), { minCents: 0, maxCents: cents(values.maxGross, '税前搜索上限') }, LABOR_VERIFIED_PAYROLL_RULE);
        setInverse(next); setResult(next.minimum !== undefined ? calculateVerifiedTakeHome({ ...verified, grossCents: next.minimum }, LABOR_VERIFIED_PAYROLL_RULE) : null);
      }
    } catch (error) { setResult(errorResult(error)); }
  }
  function example() {
    const next = { ...payrollBlank, history: 'first', currentMonths: '1', gross: '15000', target: '12000', personal: '2000', deductible: '2000' };
    setForm(next); setOrdinaryConfirmed(true); setContributionsConfirmed(true); calculate(next, true, true, true);
  }
  return <><form className={styles.panel} onChange={(event) => { setResult(null); setInverse(null); if (valueWasEdited(event, isDemo)) { setIsDemo(false); setOrdinaryConfirmed(false); setContributionsConfirmed(false); } }} onSubmit={(event) => { event.preventDefault(); calculate(); }}>
    <div className={styles.header}><div><h2>工资能到手多少？</h2><p className={styles.description}>照工资单填写工资和个人已核定缴费，计算本期到手及预扣税。</p><span className={styles.scopeTag}>2026 年 10—12 月 · 普通居民工资</span></div><button className="ghost-button" type="button" onClick={example}>先看虚构示例</button></div>
    <DemoLabel active={isDemo} />
    <div className={styles.fields}>
      <Field label="工资所属月份" type="month" value={form.month} onChange={(value) => change('month', value)} />
      <label className={styles.field}>已知税前还是税后？<select value={mode} onChange={(event) => setMode(event.target.value as 'gross' | 'net')}><option value="gross">已知税前，计算到手</option><option value="net">已知目标到手，反推税前</option></select></label>
      {mode === 'gross' ? <Field label="本期税前工资（元）" value={form.gross} onChange={(value) => change('gross', value)} hint="工资单上扣除个人缴费和个税前的工资。" /> : <Field label="希望到手的工资（元）" value={form.target} onChange={(value) => change('target', value)} />}
      <Field label="个人实际缴费（元）" value={form.personal} onChange={(value) => change('personal', value)} hint="工资单中个人社保、公积金实际扣款合计。" />
      <Field label="其中允许税前扣除的金额（元）" value={form.deductible} onChange={(value) => change('deductible', value)} hint="向财务确认；不一定等于实际缴费，不能超过它。" />
    </div>
    <Field label="本期新增基本减除费用月数" value={form.currentMonths} onChange={(value) => change('currentMonths', value)} hint="向财务确认。首次发薪不一定只算 1 个月，不能由日历月份或发薪次数推断。" /><label className={styles.field}>本单位今年此前已经给你发过工资吗？<select value={form.history} onChange={(event) => change('history', event.target.value)}><option value="">请选择，不确定时不要猜</option><option value="first">没有：这是本单位本年首次发薪</option><option value="prior">有：需要填写此前累计记录</option><option value="unknown">不清楚：需要先向财务确认</option></select><small>只看同一扣缴单位的本年记录，不能把其他单位的累计数直接混入。</small></label>
    {form.history === 'unknown' && <p className={styles.notice}>请向财务索取：本年此前累计工资、允许扣除的缴费及其他扣除、已预缴税、已计算基本减除费用的月数。</p>}
    {form.history === 'first' && <p className={styles.subtle}>你已明确选择本单位本年首次发薪：此前已发工资等累计记录按 0；本期新增基本减除费用月数仍须单独核对填写。首次就业特殊扣除不在本工具范围。</p>}
    {form.history === 'prior' && <fieldset className={styles.fieldset}><legend>此前累计记录 · 照财务记录填写</legend><div className={styles.fields}>
      <Field label="此前累计税前工资（元）" value={form.priorGross} onChange={(value) => change('priorGross', value)} /><Field label="此前累计可扣个人缴费（元）" value={form.priorPersonal} onChange={(value) => change('priorPersonal', value)} /><Field label="此前累计其他合法扣除（元）" value={form.priorAdditional} onChange={(value) => change('priorAdditional', value)} /><Field label="此前累计已预缴税（元）" value={form.priorTax} onChange={(value) => change('priorTax', value)} /><Field label="此前基本减除费用月数" value={form.priorMonths} onChange={(value) => change('priorMonths', value)} hint="不是自动使用日历月份；按财务累计记录。" />
    </div></fieldset>}
    <details className={styles.details}><summary>其他扣除与反推参数</summary><div className={styles.fields}><Field label="本期其他合法扣除（无则 0 元）" value={form.additional} onChange={(value) => change('additional', value)} hint="专项附加等合法扣除；不重复填个人缴费或基本减除费用。" />{mode === 'net' && <Field label="税前工资搜索上限（元）" value={form.maxGross} onChange={(value) => change('maxGross', value)} />}</div></details>
    <div className={styles.confirmations}><strong>计算前确认</strong><Check checked={contributionsConfirmed} onChange={setContributionsConfirmed}>缴费金额和允许扣除部分已核实，符合本期规定。</Check><Check checked={ordinaryConfirmed} onChange={setOrdinaryConfirmed}>适用居民个人普通工资累计预扣，且不涉及下列特殊处理。</Check><details><summary>查看完整适用条件</summary><p>每月 5,000 元基本减除费用；无免税收入、减免税、初次就业特殊扣除、上年低收入简化预扣，不含单独计税奖金、劳务报酬或非居民工资。未知情况请先向财务核实。</p><SourceLinks ids={LABOR_VERIFIED_PAYROLL_RULE.sourceIds} /></details></div>
    <div className={styles.actions}><button className="primary-button" type="submit">{mode === 'net' ? '反推税前工资' : '计算到手工资'}</button><button className="ghost-button" type="button" onClick={() => { setForm(payrollBlank); setResult(null); setInverse(null); setMode('gross'); setOrdinaryConfirmed(false); setContributionsConfirmed(false); setIsDemo(false); }}>重置本任务</button></div>
  </form>
  <InverseView result={inverse} label="需要多少税前工资？" sourceIds={LABOR_VERIFIED_PAYROLL_RULE.sourceIds} scope={LABOR_VERIFIED_PAYROLL_RULE.scope} formula="固定个人实缴、合法扣除和本年累计背景，在搜索边界内按分求解：税前工资 − 个人实缴 − 累计预扣税 = 目标到手工资。" />
  {inverse ? result && <details className={styles.details}><summary>查看反推金额的计算验证</summary><CalculationView result={result} focusResult={false} primaryIds={['net', 'withholding']} /></details> : <CalculationView result={result} title={isDemo ? '虚构示例 · 本期到手' : '本期预计到手'} primaryIds={['net', 'withholding']} />}
  </>;
}
function AnnualPanel() {
  const blank = { year: '2026', income: '', personal: '0', additional: '0', paid: '' };
  const [form, setForm] = useState(blank);
  const [confirmed, setConfirmed] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const change = (key: keyof typeof blank, value: string) => setForm((old) => ({ ...old, [key]: value }));
  function calculate(values = form, scopeConfirmed = confirmed, demo = isDemo) {
    setIsDemo(demo);
    try { if (!scopeConfirmed) throw new Error('请确认年度收入额与合法扣除已经核实，且不涉及特殊免税、减免或抵免。'); setResult(calculateAnnualTax({ year: numberValue(values.year, '纳税年度', true), taxableComprehensiveIncomeCents: cents(values.income, '全年综合所得收入额'), personalContributionCents: cents(values.personal, '全年专项扣除'), additionalDeductionCents: cents(values.additional, '全年其他合法扣除'), taxPaidCents: cents(values.paid, '全年已缴税额') }, LABOR_TAX_RULE)); } catch (error) { setResult(errorResult(error)); }
  }
  return <><form className={styles.panel} onChange={(event) => { setResult(null); if (valueWasEdited(event, isDemo)) { setIsDemo(false); setConfirmed(false); } }} onSubmit={(event) => { event.preventDefault(); calculate(); }}>
    <div className={styles.header}><div><h2>全年还需补退多少税？</h2><p className={styles.description}>填写全年收入额、扣除和已预缴税，查看汇算差额。</p><span className={styles.scopeTag}>2026 年 · 居民综合所得</span></div><button className="ghost-button" type="button" onClick={() => { const next = { ...blank, income: '180000', personal: '24000', paid: '8000' }; setForm(next); setConfirmed(true); calculate(next, true, true); }}>先看虚构示例</button></div>
    <DemoLabel active={isDemo} /><div className={styles.fields}>
      <Field label="全年综合所得收入额（元）" value={form.income} onChange={(value) => change('income', value)} hint="普通工资看全年收入；劳务、稿酬等须先按税法换算收入额。" /><Field label="全年已预缴税（元）" value={form.paid} onChange={(value) => change('paid', value)} hint="可从个税年度收入纳税记录核对，无则明确填 0。" /><Field label="全年专项扣除（元）" value={form.personal} onChange={(value) => change('personal', value)} hint="符合规定的个人社保、公积金等，无则 0。" /><Field label="全年专项附加及其他合法扣除（元）" value={form.additional} onChange={(value) => change('additional', value)} hint="不重复填写上面的专项扣除，无则 0。" />
    </div><details className={styles.details}><summary>年度与适用条件</summary><Field label="纳税年度" value={form.year} onChange={(value) => change('year', value)} /><p className={styles.subtle}>这不是某月预扣税的简单年化。不代算境外抵免、减免税、单独计税奖金或其他特殊处理，也不判断是否免办汇算。</p><SourceLinks ids={LABOR_TAX_RULE.sourceIds} /></details>
    <div className={styles.confirmations}><Check checked={confirmed} onChange={setConfirmed}>收入额、合法扣除与已缴税均已核实；无免税、减免、境外抵免或其他特殊处理。</Check></div>
    <div className={styles.actions}><button type="submit" className="primary-button">计算年度补退差额</button><button type="button" className="ghost-button" onClick={() => { setForm(blank); setResult(null); setConfirmed(false); setIsDemo(false); }}>重置本任务</button></div>
  </form><CalculationView result={result} title={isDemo ? '虚构示例 · 年度汇算差额' : '年度汇算差额'} primaryIds={['annual-balance', 'annual-tax']} /></>;
}
const pensionBlank = { date: '2026-10-12', ageYears: '', ageMonths: '0', contributionMonths: '', base: '', index: '', account: '', payoutYears: '20', target: '2000', maxAccount: '10000000', regionConfirmed: false, qualified: false, noTransition: false };
function PensionPanel({ benefitContext, seed, onChooseProvince, onChooseRetirement }: { benefitContext: BenefitContext; seed: RetirementSeed | null; onChooseProvince: () => void; onChooseRetirement: () => void }) {
  const [ruleId, setRuleId] = useState(LABOR_PENSION_RULES[0]?.id ?? '');
  const rule = LABOR_PENSION_RULES.find((entry) => entry.id === ruleId);
  const [form, setForm] = useState(() => ({ ...pensionBlank, ...(seed ? { date: seed.date, ageYears: String(Math.floor(seed.ageMonths / 12)), ageMonths: String(seed.ageMonths % 12) } : {}) }));
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [inverse, setInverse] = useState<InverseResult | null>(null);
  const [mode, setMode] = useState<'forward' | 'target'>('forward');
  const [isDemo, setIsDemo] = useState(false);
  const [useSeed, setUseSeed] = useState(Boolean(seed));
  const [independent, setIndependent] = useState(false);
  const contextRevision = independent ? -1 : benefitContext.revision;
  const [resultRevision, setResultRevision] = useState(benefitContext.revision);
  const [confirmedRevision, setConfirmedRevision] = useState(benefitContext.revision);
  const change = <K extends keyof typeof pensionBlank>(key: K, value: typeof pensionBlank[K]) => setForm((old) => ({ ...old, [key]: value }));
  const provinceBlocked = !independent && benefitContext.active && (!benefitContext.province || benefitContext.province !== rule?.scope.region);
  const seedStale = useSeed && Boolean(seed?.stale);
  const seedBlocked = useSeed && seed && (seed.ageMonths % 12 !== 0 || !seed.date.startsWith('2026-'));
  const activeDemo = isDemo && resultRevision === contextRevision;
  function confirm(key: 'regionConfirmed' | 'qualified' | 'noTransition', value: boolean) { setForm((old) => ({ ...old, ...(confirmedRevision !== contextRevision ? { regionConfirmed: false, qualified: false, noTransition: false } : {}), [key]: value })); setConfirmedRevision(contextRevision); }
  const currentResult = !seedStale && resultRevision === contextRevision ? result : null;
  const currentInverse = !seedStale && resultRevision === contextRevision ? inverse : null;
  function calculate(values = form, direction = mode, demo = activeDemo, revision = contextRevision, independentExample = independent) {
    setInverse(null); setIsDemo(demo); setResultRevision(revision);
    try {
      if (!rule) throw new Error('没有适用的已核验养老金金额公式。');
      if (!independentExample && seedStale) throw new Error('退休任务的条件已修改，原交接日期与核定确认已失效。请重新计算退休日期并带入。');
      if (!independentExample && benefitContext.active && !benefitContext.province) throw new Error('领取省尚未判断或经历已修改。请回领取省任务重新判断，或重置后使用经办已核定的领取地。');
      if (!independentExample && benefitContext.province && benefitContext.province !== rule.scope.region) throw new Error(`领取省是${benefitContext.province}，不能套用${rule.scope.region}公式；本版该省金额未开放。`);
      const extraMonths = numberValue(values.ageMonths, '退休年龄余月', true);
      if (extraMonths > 11) throw new Error('退休年龄余月应为 0—11；非整周岁缺少可靠计发月数依据时拒算。');
      const scenario: PensionInput = { ruleYear: Number(values.date.slice(0, 4)), ruleDate: values.date, population: rule.supportedPopulation, benefitRegionConfirmed: values.regionConfirmed && (independentExample || confirmedRevision === contextRevision), qualificationConfirmed: values.qualified && (independentExample || confirmedRevision === contextRevision), hasTransitionalOrDeemedService: !(values.noTransition && (independentExample || confirmedRevision === contextRevision)), retirementAgeMonths: numberValue(values.ageYears, '退休周岁', true) * 12 + extraMonths, contributionMonths: numberValue(values.contributionMonths, '实际缴费月数', true), pensionBaseCents: cents(values.base, '计发基数'), averageContributionIndex: numberValue(values.index, '平均缴费指数'), personalAccountCents: direction === 'target' ? 0 : cents(values.account, '个人账户储存额'), payoutYears: numberValue(values.payoutYears, '累计领取窗口', true) };
      if (direction === 'forward') setResult(calculatePensionScenario(scenario, rule));
      else {
        const next = solvePensionTarget(scenario, cents(values.target, '目标月养老金'), { minAccountCents: 0, maxAccountCents: cents(values.maxAccount, '账户搜索上限') }, rule);
        setInverse(next); setResult(next.minimum !== undefined ? calculatePensionScenario({ ...scenario, personalAccountCents: next.minimum }, rule) : null);
      }
    } catch (error) { setResult(errorResult(error)); }
  }
  function example(target?: string) {
    const next = { ...pensionBlank, ageYears: '60', contributionMonths: '360', base: '10000', index: '1', account: '100000', target: target ?? '2000', regionConfirmed: true, qualified: true, noTransition: true };
    const revision = -1; setIndependent(true); setUseSeed(false); setConfirmedRevision(revision); setForm(next); setMode(target ? 'target' : 'forward'); calculate(next, target ? 'target' : 'forward', true, revision, true);
  }
  return <><form className={styles.panel} onChange={(event) => { setResult(null); setInverse(null); if (valueWasEdited(event, activeDemo)) { setIsDemo(false); setForm((old) => ({ ...old, regionConfirmed: false, qualified: false, noTransition: false })); } }} onSubmit={(event) => { event.preventDefault(); calculate(); }}>
    <div className={styles.header}><div><h2>这些条件下，养老金有多少？</h2><p className={styles.description}>使用领取地核定的参数计算固定情景，不预测未来待遇。</p><span className={styles.scopeTag}>仅上海 · 部分 2026 年退休情景 · 整周岁</span></div><button className="ghost-button" type="button" onClick={() => example()}>先看上海虚构示例</button></div>
    <p className={styles.subtle}>上海示例使用独立虚构情景，保留领取省任务已填经历；两者不会混算。</p><DemoLabel active={activeDemo} />{independent && <div className={styles.notice}><strong>独立上海情景 · 未使用已填领取省判断</strong><p>领取省经历仍保留；这里的金额不能作为该经历的待遇结论。重新关联会恢复已填领取省与退休交接的限制。</p><button className="ghost-button" type="button" onClick={() => { setIndependent(false); setUseSeed(Boolean(seed)); setForm({ ...pensionBlank, ...(seed ? { date: seed.date, ageYears: String(Math.floor(seed.ageMonths / 12)), ageMonths: String(seed.ageMonths % 12) } : {}) }); setResult(null); setInverse(null); setIsDemo(false); setMode('forward'); setConfirmedRevision(benefitContext.revision); }}>清空金额，重新关联已填领取省</button></div>}
    {seedStale ? <div className={styles.notice}><strong>退休条件已修改，原交接已失效</strong><p>原日期、金额结果和核定确认不能继续使用。请重新计算退休日期并带入，或明确清空后设置独立情景。</p><button className="ghost-button" type="button" onClick={onChooseRetirement}>返回退休日期任务</button><button className="ghost-button" type="button" onClick={() => { setUseSeed(false); setForm(pensionBlank); setResult(null); setInverse(null); setIsDemo(false); }}>清空交接，设置独立情景</button></div> : provinceBlocked ? <div className={styles.notice}><strong>{benefitContext.province ? `领取省为${benefitContext.province}，本版不能代算金额` : '领取省判断需要更新'}</strong><p>{benefitContext.province ? '不能套用上海公式，也不能把各省养老金相加。' : '经历已修改或尚未判断，请先完成领取省任务。'}</p><button className="ghost-button" type="button" onClick={onChooseProvince}>返回领取省任务</button><details><summary>查看缺项与规则</summary>{LABOR_COVERAGE.filter((entry) => entry.status === 'blocked' && entry.id === ({ 北京: 'bj-pension', 浙江: 'zj-pension' } as Record<string, string>)[benefitContext.province ?? '']).map((entry) => <div key={entry.id}><p>{entry.reason}</p><SourceLinks ids={entry.sourceIds} /></div>)}</details></div> : seedBlocked ? <div className={styles.notice}><strong>刚才的退休日期暂不能计算金额</strong><p>已带入 {seed!.date.slice(0, 7)}、{Math.floor(seed!.ageMonths / 12)} 岁 {seed!.ageMonths % 12} 个月。本版只开放部分 2026 年整周岁情景，不擅自进岁或套用其他年份。</p><button className="ghost-button" type="button" onClick={() => { setUseSeed(false); setForm(pensionBlank); setResult(null); setInverse(null); }}>清除预填，设置独立情景</button></div> : <>
      {useSeed && <p className={styles.subtle}>已带入退休任务的日期和年龄；未替你确认完整资格、领取地或金额参数。</p>}
      {!independent && benefitContext.province && <p className={styles.subtle}>领取省任务判断为 {benefitContext.province}；仍需经办核定，并确认下方适用条件。</p>}
      <div className={styles.fields}>
        <label className={styles.field}>领取地适用公式<select value={ruleId} onChange={(event) => setRuleId(event.target.value)}>{LABOR_PENSION_RULES.map((entry) => <option value={entry.id} key={entry.id}>{entry.scope.region} · 无视同或过渡性待遇</option>)}</select></label>
        <label className={styles.field}>想算什么？<select value={mode} onChange={(event) => setMode(event.target.value as 'forward' | 'target')}><option value="forward">已知账户余额，算月养老金</option><option value="target">已知月养老金目标，反推账户余额</option></select></label>
        <Field label="退休年龄 · 周岁" value={form.ageYears} onChange={(value) => change('ageYears', value)} /><Field label="退休年龄 · 余月" value={form.ageMonths} onChange={(value) => change('ageMonths', value)} hint="非整周岁当前不支持，不自动进岁。" />
        <Field label="实际缴费月数" value={form.contributionMonths} onChange={(value) => change('contributionMonths', value)} hint="用领取地认可的实际月数，不含居民养老或视同年限。" />
        <Field label="养老金计发基数（元/月）" value={form.base} onChange={(value) => change('base', value)} hint="不是本人工资。填写经办核定值或明确的情景假设。" />
        <Field label="平均缴费指数" value={form.index} onChange={(value) => change('index', value)} hint="用领取地核定值；不知道不能默认填 1。" />
        {mode === 'forward' ? <Field label="退休时个人账户储存额（元）" value={form.account} onChange={(value) => change('account', value)} hint="包含经核定利息；不等于全部缴费总支出。" /> : <Field label="目标月养老金（元）" value={form.target} onChange={(value) => change('target', value)} />}
      </div>
      <details className={styles.details}><summary>固定日期、累计窗口与反推边界</summary><div className={styles.fields}><Field label="固定退休情景日期" type="date" value={form.date} onChange={(value) => change('date', value)} /><Field label="累计领取窗口（年）" value={form.payoutYears} onChange={(value) => change('payoutYears', value)} hint="仅用于固定月额累计，不是法定发放截止，也不等于计发月数。" />{mode === 'target' && <Field label="账户金额搜索上限（元）" value={form.maxAccount} onChange={(value) => change('maxAccount', value)} />}</div><p className={styles.subtle}>反推只求个人账户一个未知量；其余参数固定，可有多个解或无解。不反推“某城市缴几年一定领多少”，也不保证账户余额能通过缴费实现。</p>{rule && <SourceLinks ids={rule.sourceIds} />}</details>
      <div className={styles.confirmations}><strong>计算前确认</strong><Check checked={form.regionConfirmed && confirmedRevision === contextRevision} onChange={(value) => confirm('regionConfirmed', value)}>经办已核定待遇领取地为所选地区。</Check><Check checked={form.qualified && confirmedRevision === contextRevision} onChange={(value) => confirm('qualified', value)}>经办已确认退休年龄、总年限及退休方式符合按月领取条件。</Check><Check checked={form.noTransition && confirmedRevision === contextRevision} onChange={(value) => confirm('noTransition', value)}>已核实属于该公式人群，无视同缴费、过渡性或其他特殊待遇。</Check></div>
      <div className={styles.actions}><button className="primary-button" type="submit">{mode === 'forward' ? '计算月养老金情景' : '反推所需账户余额'}</button><button className="ghost-button" type="button" onClick={() => { setForm(pensionBlank); setResult(null); setInverse(null); setMode('forward'); setIsDemo(false); setUseSeed(false); }}>重置本任务</button></div>
    </>}
    <details className={styles.details}><summary>试试 2,000 / 10,000 / 20,000 元目标示例</summary><p className={styles.subtle}>均为独立上海虚构情景，保留领取省任务经历。固定基数 10,000 元、指数 1、缴费 30 年、退休 60 岁，只反推账户余额。</p><div className={styles.actions}>{['2000', '10000', '20000'].map((target) => <button className="ghost-button" type="button" key={target} onClick={() => example(target)}>目标约 {Number(target).toLocaleString('zh-CN')} 元/月</button>)}</div></details>
  </form>
  <InverseView result={currentInverse} label={activeDemo ? '虚构示例 · 所需个人账户余额' : independent ? '独立上海情景 · 所需账户余额' : '所需个人账户储存额'} sourceIds={rule?.sourceIds ?? []} scope={rule?.scope} formula="冻结规则、年龄、缴费月数、计发基数和平均指数，只在给定边界内按分求解个人账户余额；所得金额不代表缴费路径可行。" />
  {currentInverse ? currentResult && <details className={styles.details}><summary>查看反推结果的计算验证</summary><CalculationView result={currentResult} focusResult={false} primaryIds={['pension-monthly']} /></details> : <CalculationView result={currentResult} title={activeDemo ? '虚构示例 · 月养老金情景' : independent ? '独立上海情景 · 月养老金' : '固定假设下的月养老金'} primaryIds={['pension-monthly']} />}
  </>;
}
let segmentSequence = 1;
const newSegment = () => ({ id: `segment-${segmentSequence++}`, region: '', regime: 'employee' as 'employee' | 'flexible' | 'resident', from: '2026-10', to: '2026-10', personal: '', employer: '' });
function ContributionPlanPanel() {
  const [segments, setSegments] = useState(() => [{ id: 'segment-initial', region: '', regime: 'employee' as 'employee' | 'flexible' | 'resident', from: '2026-10', to: '2026-10', personal: '', employer: '' }]);
  const [confirmed, setConfirmed] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [result, setResult] = useState<CalculationResult | null>(null);
  function update(index: number, patch: Partial<typeof segments[number]>) { setSegments((old) => old.map((segment, i) => i === index ? { ...segment, ...patch } : segment)); }
  function calculate(values = segments, acknowledged = confirmed, demo = isDemo) {
    setIsDemo(demo);
    try {
      if (values.some((segment) => segment.regime === 'resident')) throw new Error('城乡居民养老暂未开放，不能混入职工或灵活就业预算；请删除该段或核实后选择实际适用制度。');
      const inputs: VerifiedContributionSegment[] = values.map((segment, index) => ({ id: segment.id, region: segment.region.trim(), regime: segment.regime, from: segment.from, to: segment.to, personalMonthlyCents: cents(segment.personal, `第 ${index + 1} 段每月个人缴费`), employerMonthlyCents: cents(segment.employer, `第 ${index + 1} 段每月单位缴费`) }));
      setResult(calculateVerifiedContributionPlan(inputs, acknowledged));
    } catch (error) { setResult(errorResult(error)); }
  }
  function example() {
    const next = [{ ...newSegment(), region: '上海（虚构预算）', from: '2026-01', to: '2026-06', personal: '2000', employer: '4000' }, { ...newSegment(), region: '深圳（虚构预算）', from: '2026-07', to: '2026-12', personal: '2500', employer: '4500' }];
    setSegments(next); setConfirmed(true); calculate(next, true, true);
  }
  return <><form className={styles.panel} onChange={(event) => { setResult(null); if (valueWasEdited(event, isDemo)) { setConfirmed(false); setIsDemo(false); } }} onSubmit={(event) => { event.preventDefault(); calculate(); }}><div className={styles.header}><div><h2>分几段缴费，共支出多少？</h2><p className={styles.description}>按每段已核定或自设月额累计支出。金额、地区或制度变化时另加一段。</p></div><button className="ghost-button" type="button" onClick={example}>先看虚构示例</button></div>
    <DemoLabel active={isDemo} /><p className={styles.subtle}>仅预算，不认定缴费权益或养老金。起止月份均含在内；不同制度分别累计。</p>
    {segments.map((segment, index) => <div className={styles.segment} key={segment.id}>
      <div className={styles.segmentTitle}><h3>第 {index + 1} 段</h3><button className="ghost-button" type="button" disabled={segments.length === 1} onClick={() => { setSegments((old) => old.filter((entry) => entry.id !== segment.id)); setResult(null); setConfirmed(false); setIsDemo(false); }}>删除此段</button></div>
      <div className={styles.fields}>
        <label className={styles.field}>地区（用于记账，不推断政策）<input value={segment.region} maxLength={40} autoComplete="off" onChange={(event) => update(index, { region: event.target.value })} /></label>
        <label className={styles.field}>参保制度<select value={segment.regime} onChange={(event) => update(index, { regime: event.target.value as typeof segment.regime, employer: event.target.value === 'flexible' ? '0' : '' })}><option value="employee">单位职工</option><option value="flexible">灵活就业 / 自行缴纳职工保险</option><option value="resident">城乡居民养老（未开放）</option></select></label>
        <Field label="开始月（含）" type="month" value={segment.from} onChange={(value) => update(index, { from: value })} />
        <Field label="结束月（含）" type="month" value={segment.to} onChange={(value) => update(index, { to: value })} />
        <Field label="每月个人缴费金额（元）" value={segment.personal} onChange={(value) => update(index, { personal: value })} />
        <Field label="每月单位缴费金额（元）" value={segment.employer} onChange={(value) => update(index, { employer: value })} hint={segment.regime === 'flexible' ? '灵活就业没有单位缴费，本项必须为 0；自行缴纳的统筹部分也归入个人资金支出。' : undefined} />
      </div>
    </div>)}
    <details className={styles.details}><summary>为什么预算不等于养老权益？</summary><p className={styles.subtle}>本预算不核定实际缴费年限、转移资格或待遇领取地；总支出不等于个人养老账户储存额，不将各地养老金相加。居民养老未开放，未来恒定月额仅是假设。</p></details>
    <Check checked={confirmed} onChange={setConfirmed}>各段金额是已核定实缴或我明确设定的预算假设；我理解此处不认证缴费权益，也不预测未来法定费率</Check>
    <div className={styles.actions}><button type="button" className="ghost-button" disabled={segments.length >= 24} onClick={() => { setSegments((old) => [...old, newSegment()]); setResult(null); setConfirmed(false); setIsDemo(false); }}>添加一段（最多 24 段）</button><button type="submit" className="primary-button">核对并合计缴费预算</button><button type="button" className="ghost-button" onClick={() => { setSegments([newSegment()]); setResult(null); setConfirmed(false); setIsDemo(false); }}>重置本任务</button></div>
  </form>{result && <CalculationView result={result} title={isDemo ? '虚构示例 · 分段缴费预算' : '分段缴费预算合计'} />}</>;
}
function RulesPanel() {
  return <section className={styles.panel}><h2>覆盖范围与官方依据</h2><p className={styles.description}>规则版本 {LABOR_RULE_VERSION}。只开放有对应人群、期间、公式与舍入依据的计算；“部分支持”不等于整地区全部可算。下列来源是公开官方材料。</p>
    <div className={styles.coverage}>{LABOR_COVERAGE.map((entry) => <article key={entry.id}><strong>{entry.region} · {entry.period}</strong><span className={styles.status} data-status={entry.status}>{entry.status === 'supported' ? '已支持' : entry.status === 'partial' ? '部分支持' : '未开放'}</span><p className={styles.subtle}>{entry.population}<br />{entry.reason}</p><SourceLinks ids={entry.sourceIds} /></article>)}</div>
    <h3>逐字段规则参数</h3><p className={styles.description}>以下为当前版本实际使用的字段、固定值和适用范围。自填金额属于输入，不代表本站已核定当地基数或缴费比例。</p>
    <div className={styles.ruleFields}>{LABOR_RULE_FIELDS.map((entry) => <article className={styles.ruleField} key={entry.field}><h4>{entry.field}</h4><p className={styles.ruleValue}>{entry.value}</p><p className={styles.subtle}>{entry.scope}</p><SourceLinks ids={entry.sourceIds} /></article>)}</div>
    <h3>逐项来源登记</h3>{Object.values(LABOR_SOURCES).map((source) => <article className={styles.sourceCard} key={source.id}><h3><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></h3><dl><dt>发布机关</dt><dd>{source.authority}</dd><dt>发布时间</dt><dd>{source.publishedAt ?? '原文未明示'}</dd><dt>适用期</dt><dd>{source.effectiveFrom ?? '见原文适用条款'} 至 {source.effectiveTo ?? '原文未载截止日；按版本核验日使用'}</dd><dt>适用范围</dt><dd>{source.scope}</dd><dt>核验日</dt><dd>{source.verifiedAt}</dd></dl><p className={styles.subtle}>{source.note}</p></article>)}
  </section>;
}
const TASKS = [
  { id: 'take-home', title: '工资能到手多少？', description: '用工资单上的已核定缴费算税后。', scope: '2026 年 10—12 月', glyph: '¥' },
  { id: 'employer-cost', title: '单位实际承担多少？', description: '工资、单位缴费与其他已填支出。', scope: '实缴金额模式', glyph: '+' },
  { id: 'annual-tax', title: '全年还需补退多少税？', description: '单独核算全年综合所得汇算差额。', scope: '2026 年居民综合所得', glyph: '年' },
  { id: 'retirement', title: '什么时候能退休？', description: '按出生月与原年龄类别查日期、年限。', scope: '2026-10-12 政策快照', glyph: '日' },
  { id: 'benefit-province', title: '养老金在哪个省领？', description: '核对户籍、正式关系和跨省经历。', scope: '普通职工关系；特殊情况拒判', glyph: '省' },
  { id: 'pension-contribution', title: '养老保险每月缴多少？', description: '按已核定基数，仅算养老缴费单项。', scope: '北京 / 上海 / 浙江 · 2026 年 10 月', glyph: '缴' },
  { id: 'pension-scenario', title: '这些条件下养老金多少？', description: '固定假设金额，或反推目标账户余额。', scope: '仅上海部分 2026 年退休情景', glyph: '领' },
  { id: 'contribution-budget', title: '分几段缴费，共支出多少？', description: '按自填月额做预算，不认定待遇权益。', scope: '职工 / 灵活就业分别累计', glyph: '段' },
] as const;
type TaskId = typeof TASKS[number]['id'];
type BenefitContext = { active: boolean; province: string | null; revision: number };
type RetirementSeed = { ageMonths: number; date: string; revision: number; stale: boolean };
export function LaborTool() {
  const [task, setTask] = useState<TaskId | null>(null);
  const [benefitContext, setBenefitContext] = useState<BenefitContext>({ active: false, province: null, revision: 0 });
  const [provinceHandoff, setProvinceHandoff] = useState(0);
  const [retirementSeed, setRetirementSeed] = useState<RetirementSeed | null>(null);
  const taskRef = useRef<HTMLDivElement>(null);
  function chooseTask(next: TaskId | null) { setTask(next); }
  useEffect(() => { if (task !== null) { taskRef.current?.focus({ preventScroll: true }); taskRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); } }, [task]);
  return <div className={styles.root}><header className="workspace-header"><div><p className="eyebrow">先选一个问题，再开始计算</p><h1>工资 · 社保 · 养老</h1><p>输入只保留在当前页面，不上传、不缓存。</p></div></header>
    <AIHint />
    {task === null ? <section aria-label="选择一个计算任务" className={styles.taskGrid}>{TASKS.map((entry) => <button type="button" key={entry.id} className={styles.taskCard} onClick={() => chooseTask(entry.id)}><span className={styles.taskGlyph}>{entry.glyph}</span><strong>{entry.title}</strong><span>{entry.description}</span><small>{entry.scope}</small><b aria-hidden="true">开始 →</b></button>)}</section> : <div ref={taskRef} tabIndex={-1} className={styles.taskNavigation} aria-label="当前任务导航"><button type="button" className="ghost-button" onClick={() => chooseTask(null)}>← 返回任务选择</button><label>切换任务<select aria-label="切换计算任务" value={task} onChange={(event) => chooseTask(event.target.value as TaskId)}>{TASKS.map((entry) => <option value={entry.id} key={entry.id}>{entry.title}</option>)}</select></label></div>}
    <div hidden={task !== 'take-home'}><PayrollPanel /></div>
    <div hidden={task !== 'employer-cost'}><EmployerCostPanel /></div>
    <div hidden={task !== 'annual-tax'}><AnnualPanel /></div>
    <div hidden={task !== 'retirement'}><RetirementPanel onInvalidate={() => setRetirementSeed((old) => old && !old.stale ? { ...old, stale: true } : old)} onContinue={(ageMonths, date) => { setRetirementSeed((old) => ({ ageMonths, date, revision: (old?.revision ?? 0) + 1, stale: false })); chooseTask('pension-scenario'); }} /></div>
    <div hidden={task !== 'benefit-province'}><BenefitProvincePanel onJudgment={(province, active) => setBenefitContext((old) => ({ province, active, revision: old.revision + 1 }))} onContinue={() => { setProvinceHandoff((old) => old + 1); chooseTask('pension-scenario'); }} /></div>
    <div hidden={task !== 'pension-contribution'}><PensionContributionItemPanel /></div>
    <div hidden={task !== 'pension-scenario'}><PensionPanel key={`${retirementSeed?.revision ?? 'none'}-${provinceHandoff}`} benefitContext={benefitContext} seed={retirementSeed} onChooseProvince={() => chooseTask('benefit-province')} onChooseRetirement={() => chooseTask('retirement')} /></div>
    <div hidden={task !== 'contribution-budget'}><ContributionPlanPanel /></div>
    <details className={`${styles.details} ${styles.ruleDrawer}`}><summary>查看支持范围与官方规则原文</summary><RulesPanel /></details>
    <p className={styles.subtle}>本工具内切换任务保留草稿；离开整个工具或刷新后清空。官方来源在新标签页打开，不附加计算参数。</p>
  </div>;
}

function RetirementPanel({ onContinue, onInvalidate }: { onContinue: (ageMonths: number, date: string) => void; onInvalidate: () => void }) {
  const blank = { birth: '', category: '' as RetirementCategory | '', contributionMonths: '', choice: 'statutory' as 'statutory' | 'early' | 'late', chosenMonth: '' };
  const [form, setForm] = useState(blank);
  const [confirmed, setConfirmed] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof calculateRetirement> | null>(null);
  const resultRef = useResultFocus(result?.ok ? result : null);
  function calculate(values = form, categoryConfirmed = confirmed, demo = isDemo) {
    setIsDemo(demo);
    try {
      if (!values.category) throw new Error('请先核实原法定退休年龄属于 50、55 还是 60 周岁类别；不能只凭性别选择。');
      if (!categoryConfirmed) throw new Error('请确认原年龄类别及普通职工适用范围；不确定时先向单位或经办核实。');
      setResult(calculateRetirement({ birthMonth: values.birth, category: values.category, contributionMonths: numberValue(values.contributionMonths, '预计退休时核定缴费月数', true), choice: values.choice, chosenRetirementMonth: values.chosenMonth || undefined }, LABOR_RETIREMENT_RULE));
    } catch (error) { setResult({ ok: false, errors: [error instanceof Error ? error.message : '无法计算退休日期'] }); }
  }
  const age = (months: number) => `${Math.floor(months / 12)} 岁 ${months % 12} 个月`;
  return <><form className={styles.panel} onChange={(event) => { onInvalidate(); setResult(null); if (valueWasEdited(event, isDemo)) { setIsDemo(false); setConfirmed(false); } }} onSubmit={(event) => { event.preventDefault(); calculate(); }}>
    <div className={styles.header}><div><h2>什么时候能退休？</h2><p className={styles.description}>核对退休日期和最低缴费年限，不代替完整资格认定。</p><span className={styles.scopeTag}>2026-10-12 政策快照 · 普通职工</span></div><button className="ghost-button" type="button" onClick={() => { onInvalidate(); const next = { ...blank, birth: '1965-01', category: 'original-60' as const, contributionMonths: '180' }; setForm(next); setConfirmed(true); calculate(next, true, true); }}>先看虚构示例</button></div>
    <DemoLabel active={isDemo} /><div className={styles.fields}><Field label="出生年月" type="month" value={form.birth} onChange={(value) => setForm((old) => ({ ...old, birth: value }))} />
    <label className={styles.field}>已核实的原法定退休年龄类别<select value={form.category} onChange={(event) => setForm((old) => ({ ...old, category: event.target.value as typeof old.category }))}><option value="">不清楚时先向单位或经办核实</option><option value="original-60">原 60 周岁类别</option><option value="original-55">原 55 周岁类别</option><option value="original-50">原 50 周岁类别</option></select><small>不能仅按性别选；女性灵活就业等身份需另行核实。</small></label>
    <Field label="预计退休时核定缴费月数" value={form.contributionMonths} onChange={(value) => setForm((old) => ({ ...old, contributionMonths: value }))} hint="用于比较最低年限，不从工作年数或预算自动推算。" /></div>
    <details className={styles.details}><summary>需要弹性提前或延迟退休？</summary><div className={styles.fields}><label className={styles.field}>退休方式<select value={form.choice} onChange={(event) => setForm((old) => ({ ...old, choice: event.target.value as typeof old.choice }))}><option value="statutory">法定退休日期</option><option value="early">弹性提前</option><option value="late">弹性延迟</option></select></label>{form.choice !== 'statutory' && <Field label="希望选择的退休年月" type="month" value={form.chosenMonth} onChange={(value) => setForm((old) => ({ ...old, chosenMonth: value }))} />}</div><p className={styles.subtle}>提前须满足法定下限及告知程序；延迟须与单位协商一致。日期符合不代表程序完成。</p><SourceLinks ids={LABOR_RETIREMENT_RULE.sourceIds} /></details>
    <div className={styles.confirmations}><Check checked={confirmed} onChange={setConfirmed}>原法定年龄类别已核实，适用普通职工渐进延退；不涉及特殊工种、病残或其他特殊退休。</Check></div>
    <div className={styles.actions}><button className="primary-button" type="submit">查看退休日期与年限</button><button className="ghost-button" type="button" onClick={() => { onInvalidate(); setForm(blank); setConfirmed(false); setIsDemo(false); setResult(null); }}>重置本任务</button></div>
  </form>
  {result && (result.ok ? <section ref={resultRef} tabIndex={-1} className={`${styles.panel} ${styles.result} ${styles.resultSummary}`}><p className={styles.resultStatus} role="status">{isDemo ? '虚构示例结果' : '日期检查完成'}</p><h2>所选退休日期</h2><div className={styles.resultCard}><span>{form.choice === 'statutory' ? '法定退休年月' : '选择的弹性退休年月'}</span><strong>{result.chosenRetirementMonth}</strong><p>对应年龄：{age(result.chosenAgeMonths)}</p><SourceLinks compact ids={result.sourceIds} /></div>
    <p className={styles.conclusion}>该方式对应最低缴费 {Math.floor(result.minimumContributionMonths / 12)} 年 {result.minimumContributionMonths % 12} 个月；输入月数<strong>{result.contributionSufficient ? '达到' : '未达到'}</strong>此最低要求。<SourceLinks compact ids={['retirement-reform', 'retirement-flexible']} /></p>
    {result.chosenAgeMonths % 12 !== 0 ? <p className={styles.notice}>下一步金额限制：该年龄不是整周岁，本版缺少可靠计发月数折算依据，暂不能计算养老金金额。无需先填写金额参数。</p> : !result.chosenRetirementMonth.startsWith('2026-') && <p className={styles.notice}>下一步金额限制：本版养老金金额仅开放部分 2026 年情景，不能把此退休年份套成 2026 年。</p>}
    <AIHint /><button type="button" className="ghost-button" onClick={() => onContinue(result.chosenAgeMonths, `${result.chosenRetirementMonth}-01`)}>带入日期，继续查看养老金金额范围 →</button>
    <details className={styles.details}><summary>完整日期、判断公式与适用范围</summary><p className={styles.subtle}>法定日期 {result.statutoryRetirementMonth}（{age(result.statutoryAgeMonths)}）；所选日期 {result.chosenRetirementMonth}（{age(result.chosenAgeMonths)}）；最低缴费 {result.minimumContributionMonths} 月。</p><p className={styles.subtle}>{result.formula}</p><p className={styles.subtle}>{result.scope.region} · {result.scope.population}<br />政策核验日 {result.scope.verifiedOn}；本工具日期覆盖 {result.scope.validFrom} 至 {result.scope.validTo}，并非法规到期日。</p>{result.warnings.map((warning, index) => <p className={styles.subtle} key={index}>{warning}</p>)}<SourceLinks ids={result.sourceIds} /></details>
  </section> : <ErrorSummary errors={result.errors} />)}
  </>;
}

let benefitPeriodSequence = 1;
const newBenefitPeriod = () => ({ id: `benefit-${benefitPeriodSequence++}`, province: '', from: '', to: '', months: '', kind: '' as '' | 'ordinary' | 'temporary' });
function ProvinceSelect({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint?: string }) {
  return <label className={styles.field}>{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">请选择已核实的省级地区</option>{LABOR_BENEFIT_PROVINCE_RULE.supportedProvinces.map((province) => <option value={province} key={province}>{province}{province === '浙江' ? '（含温州等市）' : ''}</option>)}</select>{hint && <small>{hint}</small>}</label>;
}
function BenefitProvincePanel({ onJudgment, onContinue }: { onJudgment: (province: string | null, active: boolean) => void; onContinue: () => void }) {
  const blank = { date: '2026-10-12', household: '', relationship: '', participation: '', account: 'unknown' as 'ordinary' | 'temporary' | 'unknown', records: false, eligible: false, noSpecial: false };
  const [form, setForm] = useState(blank);
  const [periods, setPeriods] = useState(() => [{ id: 'benefit-initial', province: '', from: '', to: '', months: '', kind: '' as '' | 'ordinary' | 'temporary' }]);
  const [result, setResult] = useState<BenefitProvinceResult | null>(null);
  const [step, setStep] = useState<'prepare' | 'history'>('prepare');
  const [showHelp, setShowHelp] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const stepRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const element = stepRef.current; if (element && !element.closest('[hidden]')) { element.focus({ preventScroll: true }); element.scrollIntoView({ block: 'start', behavior: 'instant' }); } }, [step]);
  const resultRef = useResultFocus(result?.ok ? result : null);
  const helpRef = useResultFocus(showHelp);
  const change = <K extends keyof typeof blank>(key: K, value: typeof blank[K]) => setForm((old) => ({ ...old, [key]: value }));
  function invalidate() { setResult(null); onJudgment(null, true); }
  function updatePeriod(index: number, patch: Partial<typeof periods[number]>) { setPeriods((old) => old.map((period, i) => i === index ? { ...period, ...patch } : period)); }
  function fail(message: string) { setResult({ ok: false, errors: [message], sourceIds: LABOR_BENEFIT_PROVINCE_RULE.sourceIds, scope: LABOR_BENEFIT_PROVINCE_RULE.scope }); onJudgment(null, true); }
  function nextStep() {
    if (!form.household || !form.relationship || !form.participation) { fail('请先核实户籍省、正式养老关系保留省和当前参保省；不知道时可点击“我不清楚，先看准备清单”。'); return; }
    if (form.account === 'unknown') { fail('当前账户性质还不清楚。请问经办：“我这里是普通基本养老关系，还是临时缴费账户？”'); return; }
    if (form.account === 'temporary') { fail('本版临时账户不自动判省，请先核定正式关系保留地、临时账户归集及年限归属。'); return; }
    setResult(null); setStep('history');
  }
  function calculate(values = form, history = periods, demo = isDemo) {
    setIsDemo(demo);
    try {
      if (values.account === 'temporary' || history.some((period) => period.kind === 'temporary')) throw new Error('本版涉及临时账户时不自动判断领取省，请先请经办核定账户归集及年限归属。');
      const input: BenefitProvinceInput = { asOfDate: values.date, householdProvince: values.household, ordinaryRelationshipProvince: values.relationship, currentParticipationProvince: values.participation, currentAccountKind: values.account, recordsConfirmed: values.records, eligibilityConfirmed: values.eligible, hasSpecialCircumstances: !values.noSpecial, temporaryHandlingConfirmed: false,
        periods: history.map((period, index) => { if (!period.kind) throw new Error(`第 ${index + 1} 段账户性质尚未确认；请查经办关系记录。`); return { id: period.id, province: period.province, from: period.from, to: period.to, recognizedMonths: numberValue(period.months, `第 ${index + 1} 段认可实际缴费月数`, true), accountKind: period.kind }; }),
      };
      const next = calculateBenefitProvince(input, LABOR_BENEFIT_PROVINCE_RULE); setResult(next); onJudgment(next.ok ? next.benefitProvince : null, true);
    } catch (error) { fail(error instanceof Error ? error.message : '经历暂不能核对'); }
  }
  function example() {
    const next = { ...blank, household: '江西', relationship: '上海', participation: '上海', account: 'ordinary' as const, records: true, eligible: true, noSpecial: true };
    const history = [{ ...newBenefitPeriod(), province: '北京', from: '2010-01', to: '2021-12', months: '144', kind: 'ordinary' as const }, { ...newBenefitPeriod(), province: '上海', from: '2022-01', to: '2024-12', months: '36', kind: 'ordinary' as const }];
    setForm(next); setPeriods(history); setStep('history'); setShowHelp(false); calculate(next, history, true);
  }
  return <><form className={styles.panel} onChange={(event) => { invalidate(); if (valueWasEdited(event, isDemo)) { setIsDemo(false); setForm((old) => ({ ...old, records: false, eligible: false, noSpecial: false })); } }} onSubmit={(event) => { event.preventDefault(); if (step === 'prepare') nextStep(); else calculate(); }}>
    <div className={styles.header}><div><h2>养老金在哪个省领？</h2><p className={styles.description}>先核实关系，再填经历；不是自由挑选缴满十年的城市。</p><span className={styles.scopeTag}>2026-10-12 快照 · 普通企业职工关系</span></div><button type="button" className="ghost-button" onClick={example}>先看跨省虚构示例</button></div>
    <DemoLabel active={isDemo} /><p className={styles.subtle}>不用提供姓名或证件。示例完全虚构；修改经历会让原领取省和养老金结果失效。</p>
    <div ref={stepRef} tabIndex={-1} className={styles.stepHeading}><span>第 {step === 'prepare' ? '1' : '2'} 步 / 2</span><strong>{step === 'prepare' ? '核实户籍与当前关系' : '填写已核定的关系经历'}</strong></div>
    {step === 'prepare' ? <>
      <button type="button" className="ghost-button" onClick={() => setShowHelp(true)}>我不清楚，先看准备清单</button>
      {showHelp && <section ref={helpRef} tabIndex={-1} className={styles.preparation} aria-label="向经办核实的资料"><h3>拿到这些信息，再继续</h3><ul><li>户籍登记在哪个省？温州按浙江填写。</li><li>普通基本养老关系目前保留在哪个省？现在缴费的地方是否相同？</li><li>现在及历史账户是普通关系还是临时账户？不知道时请经办确认。</li><li>各段省份、起止年月、认可的实际缴费月数及先后顺序。</li><li>是否已有领取资格且尚未领取待遇？是否有视同、跨制度、户籍变化等特殊历史？</li></ul><p>可以直接问经办：“请帮我核对普通关系保留地、各省认可实际月数和临时账户情况。”</p><SourceLinks compact ids={LABOR_BENEFIT_PROVINCE_RULE.sourceIds} /></section>}
      <div className={styles.fields}><ProvinceSelect label="户籍在哪个省？" value={form.household} onChange={(value) => change('household', value)} /><ProvinceSelect label="正式养老关系保留在哪个省？" value={form.relationship} onChange={(value) => change('relationship', value)} hint="查经办转移记录，不一定是当前工作地。" /><ProvinceSelect label="当前在哪个省参保缴费？" value={form.participation} onChange={(value) => change('participation', value)} />
      <label className={styles.field}>当前账户是什么性质？<select value={form.account} onChange={(event) => change('account', event.target.value as typeof form.account)}><option value="unknown">不清楚，需要先向经办确认</option><option value="ordinary">普通基本养老关系</option><option value="temporary">临时缴费账户（本版不自动判省）</option></select><small>“临时账户”不是指工作合同期限。</small></label></div>
    </> : <>
      <p className={styles.subtle}>户籍：{form.household}；正式关系：{form.relationship}；当前参保：{form.participation}。<button type="button" className={styles.textButton} onClick={() => setStep('prepare')}>返回修改</button></p>
      <p className={styles.subtle}>按经办记录填完整经历。同省可多段，月份不能重叠；不把空档、未来预算、居民养老或视同年限填进去。</p>
      {periods.map((period, index) => <fieldset className={styles.segment} key={period.id}><legend>经历 {index + 1}</legend><div className={styles.fields}>
        <ProvinceSelect label="这一段在哪个省？" value={period.province} onChange={(value) => updatePeriod(index, { province: value })} /><label className={styles.field}>这段账户性质<select value={period.kind} onChange={(event) => updatePeriod(index, { kind: event.target.value as typeof period.kind })}><option value="">尚未核实</option><option value="ordinary">普通基本养老关系</option><option value="temporary">临时账户（本版不自动判省）</option></select></label>
        <Field label="关系经历开始月（含）" type="month" value={period.from} onChange={(value) => updatePeriod(index, { from: value })} /><Field label="关系经历结束月（含）" type="month" value={period.to} onChange={(value) => updatePeriod(index, { to: value })} /><Field label="本段认可的实际缴费月数" value={period.months} onChange={(value) => updatePeriod(index, { months: value })} hint="以经办核定为准，不自动把工作年数乘 12。" />
      </div><button className="ghost-button" type="button" disabled={periods.length === 1} onClick={() => { setPeriods((old) => old.filter((entry) => entry.id !== period.id)); invalidate(); setIsDemo(false); setForm((old) => ({ ...old, records: false, eligible: false, noSpecial: false })); }}>删除这段</button></fieldset>)}
      <button className="ghost-button" type="button" disabled={periods.length >= 24} onClick={() => { setPeriods((old) => [...old, newBenefitPeriod()]); invalidate(); setIsDemo(false); setForm((old) => ({ ...old, records: false, eligible: false, noSpecial: false })); }}>增加一段（最多 24 段）</button>
      <div className={styles.confirmations}><strong>计算前确认</strong><Check checked={form.records} onChange={(value) => change('records', value)}>关系保留地、账户性质、先后和实际月数均已核实，且经历完整。</Check><Check checked={form.eligible} onChange={(value) => change('eligible', value)}>经办已确认在判断时点符合按月领取条件；不是仅因某省满十年就认定可退休。</Check><Check checked={form.noSpecial} onChange={(value) => change('noSpecial', value)}>大陆户籍、尚未领取企业职工养老金、同一养老制度，且没有下列特殊历史。</Check><details><summary>查看必须排除的特殊情况</summary><p>外籍或港澳台身份，城乡居民或机关事业制度混合，视同缴费、军龄、组织调动、户籍迁移或账户转换待处理、2010 年前转移遗留、重复关系、欠缴补缴等。已有待遇者不能借此重新选省；本版临时账户也拒判。</p></details></div>
    </>}
    <div className={styles.actions}><button className="primary-button" type="submit">{step === 'prepare' ? '下一步：填关系经历' : '判断领取省份'}</button><button className="ghost-button" type="button" onClick={() => { setForm(blank); setPeriods([newBenefitPeriod()]); setResult(null); setStep('prepare'); setShowHelp(false); setIsDemo(false); onJudgment(null, false); }}>重置本任务</button></div>
  </form>
  {result && (result.ok ? <section ref={resultRef} tabIndex={-1} className={`${styles.panel} ${styles.result} ${styles.resultSummary}`}><p className={styles.resultStatus} role="status">{isDemo ? '虚构示例结果' : '省级规则判断完成'}</p><h2>按已确认输入，对应领取省是</h2><div className={styles.resultCard}><strong>{result.benefitProvince}</strong><p>{result.explanation}</p><SourceLinks compact ids={result.sourceIds.slice(0, 2)} /></div><p className={styles.subtle}>这项判断不等于完整领取资格核定，也不计算养老金金额。</p><AIHint />
    <button type="button" className="primary-button" onClick={onContinue}>下一步：查看{result.benefitProvince}金额支持范围 →</button>
    {!LABOR_PENSION_RULES.some((entry) => entry.scope.region === result.benefitProvince) && <p className={styles.notice}>本版尚未开放{result.benefitProvince}金额计算，不能用上海公式代替。</p>}
    <details className={styles.details}><summary>为什么是这个省？查看路径与原文</summary>{result.steps.map((step, index) => <article className={styles.detailLine} key={index}><strong>{index + 1} · {step.label}</strong><p>{step.detail}</p><SourceLinks ids={step.sourceIds} /></article>)}{result.warnings.map((warning, index) => <p className={styles.subtle} key={index}>{warning}</p>)}<p className={styles.subtle}>{result.scope.region} · {result.scope.population}<br />本版快照适用 {result.scope.validFrom} 至 {result.scope.validTo} · 核验日 {result.scope.verifiedOn}</p><SourceLinks ids={result.sourceIds} /></details>
  </section> : <><ErrorSummary errors={result.errors} /><SourceLinks compact ids={result.sourceIds.slice(0, 2)} /><AIHint /></>)}
  </>;
}

function PensionContributionItemPanel() {
  const [ruleId, setRuleId] = useState(LABOR_PENSION_CONTRIBUTION_ITEMS[0]?.id ?? '');
  const rule = LABOR_PENSION_CONTRIBUTION_ITEMS.find((entry) => entry.id === ruleId);
  const [month, setMonth] = useState('2026-10');
  const [base, setBase] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [result, setResult] = useState<CalculationResult | null>(null);
  function calculate(nextBase = base, nextMonth = month, nextConfirmed = confirmed, demo = isDemo) {
    setIsDemo(demo);
    try { setResult(calculatePensionContributionItem({ month: nextMonth, confirmedBaseYuan: numberValue(nextBase, '经办核定养老基数（仅整数元）', true), populationAndBaseConfirmed: nextConfirmed }, rule)); } catch (error) { setResult(errorResult(error)); }
  }
  function example() {
    if (!rule) return;
    const nextBase = String(rule.minimumBaseYuan);
    const nextMonth = rule.scope.validFrom.slice(0, 7);
    setMonth(nextMonth); setBase(nextBase); setConfirmed(true); calculate(nextBase, nextMonth, true, true);
  }
  return <><form className={styles.panel} onChange={(event) => { setResult(null); if (valueWasEdited(event, isDemo)) { setConfirmed(false); setIsDemo(false); } }} onSubmit={(event) => { event.preventDefault(); calculate(); }}>
    <div className={styles.header}><div><h2>养老保险每月缴多少？</h2><p className={styles.description}>选择地区与人群，填写经办核定的养老基数。这里只算养老一项。</p></div><button type="button" className="ghost-button" onClick={example}>先看下限虚构示例</button></div>
    <DemoLabel active={isDemo} /><span className={styles.scopeTag}>北京 / 上海 / 浙江 · 2026 年 10 月 · 整数元基数</span>
    <div className={styles.fields}>
      <label className={styles.field}>地区与养老参保人群<select value={ruleId} onChange={(event) => { setRuleId(event.target.value); setBase(''); setConfirmed(false); }}><option value="">请选择已开放的单项规则</option>{LABOR_PENSION_CONTRIBUTION_ITEMS.map((entry) => <option value={entry.id} key={entry.id}>{entry.scope.region} · {entry.regime === 'employee' ? '普通企业职工' : '灵活就业'}</option>)}</select></label>
      <Field label="养老缴费月份" type="month" value={month} onChange={setMonth} />
      <Field label="已核定养老缴费基数（整数元）" value={base} onChange={setBase} hint="不是直接填写本月工资。小数元、上下限外或未核定基数拒算，不自动夹取、取整。" />
    </div>
    {rule && <><p className={styles.subtle}>本档基数 {rule.minimumBaseYuan.toLocaleString('zh-CN')}–{rule.maximumBaseYuan.toLocaleString('zh-CN')} 元；个人 {rule.personalRatePercent}%{rule.regime === 'employee' ? `，单位 ${rule.employerRatePercent}%` : '，没有单位缴费项'}。</p><details className={styles.details}><summary>所选人群、比例与官方规则</summary><article className={styles.sourceCard}><h3>当前单项规则</h3><dl><dt>适用人群</dt><dd>{rule.scope.population}</dd><dt>基数上下限</dt><dd>{rule.minimumBaseYuan.toLocaleString('zh-CN')}–{rule.maximumBaseYuan.toLocaleString('zh-CN')} 元／月</dd><dt>个人缴费比例</dt><dd>{rule.personalRatePercent}%</dd><dt>单位缴费比例</dt><dd>{rule.regime === 'employee' ? `${rule.employerRatePercent}%` : '不适用；由灵活就业人员自行缴纳'}</dd><dt>规则完整月份范围</dt><dd>{rule.scope.validFrom} 至 {rule.scope.validTo}</dd><dt>核验日</dt><dd>{rule.scope.verifiedOn}</dd></dl><SourceLinks ids={rule.sourceIds} /></article></details></>}
    <Check checked={confirmed} onChange={setConfirmed}>属于所选规则的人群，且基数已由经办核定；无补缴等特殊处理，未把工作地、工资或示例下限直接当作参保资格或本人核定基数</Check>
    <p className={styles.subtle}>不是完整五险一金或养老金待遇，缴费支出不等于个人账户入账；小数基数及未知舍入规则不代算。</p>
    <div className={styles.actions}><button type="submit" className="primary-button">计算养老缴费单项</button><button type="button" className="ghost-button" onClick={() => { setBase(''); setMonth('2026-10'); setConfirmed(false); setResult(null); setIsDemo(false); }}>重置本任务</button></div>
  </form>{result && <CalculationView result={result} title={isDemo ? '虚构示例 · 养老缴费单项' : '每月养老缴费单项'} />}</>;
}

function EmployerCostPanel() {
  const blank = { month: '2026-10', gross: '', employer: '', extra: '0' };
  const [form, setForm] = useState(blank);
  const [confirmed, setConfirmed] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [result, setResult] = useState<CalculationResult | null>(null);
  function calculate(values = form, scopeConfirmed = confirmed, demo = isDemo) {
    setIsDemo(demo);
    try { setResult(calculateVerifiedEmployerCost({ month: values.month, grossCents: cents(values.gross, '税前工资'), employerContributionCents: cents(values.employer, '单位实际缴费'), extraEmployerCostCents: cents(values.extra, '其他单位支出'), contributionsConfirmed: scopeConfirmed }, LABOR_VERIFIED_PAYROLL_RULE)); } catch (error) { setResult(errorResult(error)); }
  }
  return <><form className={styles.panel} onChange={(event) => { setResult(null); if (valueWasEdited(event, isDemo)) { setConfirmed(false); setIsDemo(false); } }} onSubmit={(event) => { event.preventDefault(); calculate(); }}>
    <div className={styles.header}><div><h2>单位实际承担多少？</h2><p className={styles.description}>税前工资 + 单位实际缴费 + 其他已填支出，不需要个人个税背景。</p><span className={styles.scopeTag}>2026 年 10—12 月 · 单位实缴金额</span></div><button className="ghost-button" type="button" onClick={() => { const next = { ...blank, gross: '15000', employer: '4000', extra: '500' }; setForm(next); setConfirmed(true); calculate(next, true, true); }}>先看虚构示例</button></div>
    <DemoLabel active={isDemo} /><div className={styles.fields}><Field label="支出所属月份" type="month" value={form.month} onChange={(value) => setForm((old) => ({ ...old, month: value }))} /><Field label="本期税前工资（元）" value={form.gross} onChange={(value) => setForm((old) => ({ ...old, gross: value }))} /><Field label="单位实际社保公积金缴费（元）" value={form.employer} onChange={(value) => setForm((old) => ({ ...old, employer: value }))} hint="向财务查单位承担的已核定金额，不是个人工资扣款。" /><Field label="其他单位支出（无则 0 元）" value={form.extra} onChange={(value) => setForm((old) => ({ ...old, extra: value }))} hint="如另付福利、保险。未填的成本不会包含在结果中。" /></div>
    <div className={styles.confirmations}><Check checked={confirmed} onChange={setConfirmed}>单位缴费金额已核实，属于本期适用支出；其他成本按已填金额计算。</Check></div>
    <details className={styles.details}><summary>适用范围与来源</summary><p className={styles.subtle}>{LABOR_VERIFIED_PAYROLL_RULE.employerCostScope?.population}。本工具不推算地方费率，不代表已覆盖企业所有财务成本。</p><SourceLinks ids={LABOR_VERIFIED_PAYROLL_RULE.employerCostSourceIds ?? []} /></details>
    <div className={styles.actions}><button className="primary-button" type="submit">计算单位成本</button><button className="ghost-button" type="button" onClick={() => { setForm(blank); setConfirmed(false); setIsDemo(false); setResult(null); }}>重置本任务</button></div>
  </form><CalculationView result={result} title={isDemo ? '虚构示例 · 单位成本' : '本期单位成本情景'} primaryIds={['company-cost']} /></>;
}
