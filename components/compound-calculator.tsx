'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  calculateCompound,
  durationInYears,
  type CashFlowAmountType,
  type CashFlowDirection,
  type CashFlowPlan,
  type CompoundInput,
  type CompoundPoint,
  type CompoundResult,
} from '@/lib/compound';
import {
  COMPOUND_CACHE_KEY,
  COMPOUND_LEGACY_CACHE_KEY,
  parseCompoundCache,
  serializeCompoundCache,
  type ToolCurrency,
} from '@/lib/tool-cache';

type Currency = ToolCurrency;

const DEFAULT_INPUT: CompoundInput = {
  principal: 10000,
  annualRatePct: 8,
  years: 10,
  months: 0,
  days: 0,
  compoundsPerYear: 12,
  cashFlows: [
    {
      id: 'cash-flow-1',
      direction: 'deposit',
      amountType: 'fixed',
      amount: 500,
      startMonth: 1,
      durationMonths: 120,
      intervalMonths: 1,
    },
  ],
};

function createDefaultInput(): CompoundInput {
  return {
    ...DEFAULT_INPUT,
    cashFlows: DEFAULT_INPUT.cashFlows.map((plan) => ({ ...plan })),
  };
}

const compoundFrequencyOptions = [
  { value: 365, label: '每日复利' },
  { value: 12, label: '每月复利' },
  { value: 4, label: '每季度复利' },
  { value: 2, label: '每半年复利' },
  { value: 1, label: '每年复利' },
];

const cashFlowIntervalOptions = [
  { value: 1, label: '每月' },
  { value: 3, label: '每季度' },
  { value: 6, label: '每半年' },
  { value: 12, label: '每年' },
];

function cashFlowIntervalLabel(intervalMonths: number) {
  return cashFlowIntervalOptions.find((option) => option.value === intervalMonths)?.label
    ?? `每 ${intervalMonths} 个月`;
}

function formatMoney(value: number, currency: Currency, compact = false, precise = false) {
  if (!Number.isFinite(value)) return '—';
  const maximumFractionDigits = precise ? 2 : compact ? 1 : Math.abs(value) < 100 ? 2 : 0;
  if (currency === 'USDT') {
    return `${new Intl.NumberFormat('zh-CN', {
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits,
    }).format(value)} USDT`;
  }
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits,
  }).format(value);
}

function formatDuration(timeYears: number) {
  const totalMonths = Math.floor(timeYears * 12 + 1e-9);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const days = Math.round(Math.max(0, timeYears - totalMonths / 12) * 365);
  return [years > 0 ? `${years} 年` : '', months > 0 ? `${months} 个月` : '', days > 0 ? `${days} 天` : '']
    .filter(Boolean).join(' ') || '0 天';
}

function formatAssetPercentage(amount: number, assetBase: number) {
  if (assetBase <= 0) return '—';
  const ratio = amount / assetBase;
  if (!Number.isFinite(ratio * 100)) return '超出显示范围';
  return new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 2 }).format(ratio);
}

function CompoundChart({ result, currency, cashFlowPlans }: {
  result: CompoundResult;
  currency: Currency;
  cashFlowPlans: CashFlowPlan[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const points = result.periods;
  const width = 900;
  const height = 320;
  const margin = { top: 24, right: 18, bottom: 45, left: 70 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = points.flatMap((point) => [point.total, point.invested]);
  const rawMinimum = Math.min(0, ...values);
  const rawMaximum = Math.max(0, ...values);
  const span = Math.max(rawMaximum - rawMinimum, Math.abs(rawMaximum) * 0.05, 1);
  const minimum = rawMinimum < 0 ? rawMinimum - span * 0.08 : 0;
  const maximum = rawMaximum > 0 ? rawMaximum + span * 0.08 : span;
  const x = (point: CompoundPoint) =>
    margin.left + (point.timeYears / result.durationYears) * plotWidth;
  const y = (value: number) =>
    margin.top + ((maximum - value) / (maximum - minimum)) * plotHeight;
  const line = (key: 'total' | 'invested') =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${x(point).toFixed(2)},${y(point[key]).toFixed(2)}`,
      )
      .join(' ');
  const area = `${line('total')} ${points
    .slice()
    .reverse()
    .map((point) => `L${x(point).toFixed(2)},${y(point.invested).toFixed(2)}`)
    .join(' ')} Z`;
  const resolvedActiveIndex = Math.min(activeIndex ?? points.length - 1, points.length - 1);
  const active = points[resolvedActiveIndex];
  const partialMonth = active.month > 0 && active.timeYears * 12 < active.month - 1e-9;
  const periodLabel = active.month === 0 ? '起始时点' : `第 ${active.month} 个月${partialMonth ? '（不足整月）' : ''}`;
  const detailMoney = (value: number) => formatMoney(value, currency, false, true);
  const netFlow = active.deposits - active.withdrawals;
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => minimum + ((maximum - minimum) * index) / 4,
  );
  const xTicks = Array.from({ length: 5 }, (_, index) => (result.durationYears * index) / 4);
  const selectPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (pointerX - margin.left) / plotWidth));
    const timeYears = ratio * result.durationYears;
    const lower = Math.min(Math.floor(timeYears * 12), points.length - 1);
    const upper = Math.min(lower + 1, points.length - 1);
    setActiveIndex(timeYears - points[lower].timeYears <= points[upper].timeYears - timeYears ? lower : upper);
  };

  return (
    <section className="panel chart-panel">
      <div className="chart-header">
        <div>
          <h2>价值走势</h2>
          <div className="chart-legend" aria-label="图例">
            <span className="legend-item"><i className="legend-line" />总价值</span>
            <span className="legend-item"><i className="legend-line invested" />净投入</span>
          </div>
        </div>
        <div className="chart-reading" aria-live="polite">
          <strong>{formatMoney(active.total, currency)}</strong>
          <span>{formatDuration(active.timeYears)} · 收益 {formatMoney(active.interest, currency)}</span>
        </div>
      </div>

      <div className="chart-scroll-region" role="region" aria-label="价值曲线，可横向滚动" tabIndex={0}>
      <svg
        className="compound-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`复利价值走势，最终价值 ${formatMoney(result.finalValue, currency)}，净投入 ${formatMoney(result.invested, currency)}`}
        onPointerMove={(event) => {
          if (event.pointerType !== 'touch') selectPoint(event);
        }}
        onPointerUp={(event) => {
          if (event.pointerType === 'touch') selectPoint(event);
        }}
      >
        <rect
          className="chart-frame"
          x={margin.left}
          y={margin.top}
          width={plotWidth}
          height={plotHeight}
          fill="none"
        />
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              className="chart-grid-line"
              x1={margin.left}
              x2={width - margin.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="chart-axis-text" x={margin.left - 10} y={y(tick) + 4} textAnchor="end">
              {formatMoney(tick, currency, true)}
            </text>
          </g>
        ))}
        {minimum < 0 && maximum > 0 ? (
          <line
            className="chart-zero-line"
            x1={margin.left}
            x2={width - margin.right}
            y1={y(0)}
            y2={y(0)}
          />
        ) : null}
        {xTicks.map((tick) => (
          <text
            className="chart-axis-text"
            key={tick}
            x={margin.left + (tick / result.durationYears) * plotWidth}
            y={height - 18}
            textAnchor={tick === 0 ? 'start' : tick === result.durationYears ? 'end' : 'middle'}
          >
            {formatDuration(tick)}
          </text>
        ))}
        <path className="chart-area" d={area} />
        <path className="chart-invested-line" d={line('invested')} />
        <path className="chart-total-line" d={line('total')} />
        <line
          className="chart-crosshair"
          x1={x(active)}
          x2={x(active)}
          y1={margin.top}
          y2={margin.top + plotHeight}
        />
        <circle className="chart-point-total" cx={x(active)} cy={y(active.total)} r="5" />
        <circle className="chart-point-invested" cx={x(active)} cy={y(active.invested)} r="4" />
      </svg>
      </div>
      <label className="chart-time-picker">
        <span><span>查看时间</span><span>{formatDuration(active.timeYears)}</span></span>
        <input
          type="range"
          min={0}
          max={points.length - 1}
          step={1}
          value={resolvedActiveIndex}
          aria-label="选择复利曲线时间"
          aria-valuetext={`${formatDuration(active.timeYears)}，总价值 ${formatMoney(active.total, currency)}`}
          onChange={(event) => setActiveIndex(Number(event.target.value))}
        />
        <small>移动鼠标、点选曲线或拖动滑块查看月份；移开鼠标后保留所选明细。</small>
      </label>

      <section className="chart-period-detail" aria-label="所选月份现金流明细">
        <div className="chart-period-heading">
          <h3>{periodLabel} · 现金流明细</h3>
          <span>{active.month === 0 ? '初始本金及立即执行的计划' : `${formatDuration(active.startTimeYears)} → ${formatDuration(active.timeYears)}`}</span>
        </div>
        <div className="chart-period-summary">
          <div>
            <span>本期投入</span>
            <strong>{detailMoney(active.deposits)}</strong>
            <small>占执行前资产 {formatAssetPercentage(active.deposits, active.valueBeforeCashFlows)}</small>
          </div>
          <div>
            <span>本期取走</span>
            <strong>{detailMoney(active.withdrawals)}</strong>
            <small>占执行前资产 {formatAssetPercentage(active.withdrawals, active.valueBeforeCashFlows)}</small>
          </div>
          <div>
            <span>本期净流入</span>
            <strong>{netFlow > 0 ? '+' : ''}{detailMoney(netFlow)}</strong>
            <small>投入 − 取走</small>
          </div>
          <div>
            <span>本期收益</span>
            <strong>{detailMoney(active.periodInterest)}</strong>
            <small>由期初资产产生的收益</small>
          </div>
        </div>
        <dl className="chart-period-balances">
          <div><dt>期初资产</dt><dd>{detailMoney(active.openingValue)}</dd></div>
          <div><dt>执行前资产（计息后）</dt><dd>{detailMoney(active.valueBeforeCashFlows)}</dd></div>
          <div><dt>执行后资产</dt><dd>{detailMoney(active.total)}</dd></div>
        </dl>

        {active.cashFlows.length > 0 ? (
          <div className="chart-period-table-scroll" role="region" aria-label="本期执行的现金流计划" tabIndex={0}>
            <table className="chart-period-table">
              <thead><tr><th scope="col">计划</th><th scope="col">执行方式</th><th scope="col">本期金额</th><th scope="col">占执行前资产</th></tr></thead>
              <tbody>
                {active.cashFlows.map((flow) => (
                  <tr key={flow.planId}>
                    <th scope="row">计划 {String(cashFlowPlans.findIndex((plan) => plan.id === flow.planId) + 1).padStart(2, '0')} · {flow.direction === 'deposit' ? '投入' : '取走'}</th>
                    <td>{flow.amountType === 'percentage' ? `当前资产的 ${flow.configuredAmount}%` : '固定金额'}</td>
                    <td>{detailMoney(flow.amount)}</td>
                    <td>{formatAssetPercentage(flow.amount, active.valueBeforeCashFlows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="chart-period-empty">本期没有现金流计划执行，资产仅按设定利率变化。</p>}

        <p className="chart-period-note">
          {active.valueBeforeCashFlows > 0
            ? '所有占比均以本期计息后、执行现金流前的资产为基数。'
            : '执行前资产不大于 0，占比不适用；百分比计划的实际金额为 0。'}
          {active.month > 0 && ' 本期包含上个期末之后、所选期末当天及之前的现金流。'}
        </p>
      </section>
    </section>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step = 'any',
  integer = false,
  suffix,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number | 'any';
  integer?: boolean;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const normalize = () => {
    const parsed = draft === null || draft.trim() === '' ? 0 : Number(draft);
    let normalized = Number.isFinite(parsed) ? parsed : 0;
    if (integer) normalized = Math.round(normalized);
    if (min !== undefined) normalized = Math.max(min, normalized);
    if (max !== undefined) normalized = Math.min(max, normalized);
    setDraft(null);
    onChange(normalized);
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`input-shell ${suffix ? 'has-suffix' : ''}`}>
        <input
          id={id}
          type="number"
          inputMode={integer ? 'numeric' : 'decimal'}
          min={min}
          max={max}
          step={step}
          value={draft ?? value}
          onFocus={() => setDraft(String(value))}
          onChange={(event) => {
            const nextDraft = event.target.value;
            setDraft(nextDraft);
            if (nextDraft === '') return;
            const nextValue = Number(nextDraft);
            if (Number.isFinite(nextValue)) onChange(nextValue);
          }}
          onBlur={normalize}
        />
        {suffix ? <span className="input-suffix">{suffix}</span> : null}
      </div>
    </div>
  );
}

export function CompoundCalculator() {
  const [input, setInput] = useState<CompoundInput>(createDefaultInput);
  const [currency, setCurrency] = useState<Currency>('CNY');
  const [cacheReady, setCacheReady] = useState(false);
  const [cacheStatus, setCacheStatus] = useState('读取缓存…');
  const nextCashFlowId = useRef(2);
  const calculation = useMemo(() => {
    try {
      return { result: calculateCompound(input), error: null };
    } catch (error) {
      return {
        result: null,
        error: error instanceof Error ? error.message : '计算失败，请检查输入。',
      };
    }
  }, [input]);

  useEffect(() => {
    let cached: ReturnType<typeof parseCompoundCache> = null;
    let storageAvailable = true;
    try {
      cached = parseCompoundCache(
        window.localStorage.getItem(COMPOUND_CACHE_KEY)
          ?? window.localStorage.getItem(COMPOUND_LEGACY_CACHE_KEY),
      );
    } catch {
      storageAvailable = false;
    }

    const frame = window.requestAnimationFrame(() => {
      if (cached) {
        setInput(cached.input);
        setCurrency(cached.currency);
        nextCashFlowId.current = cached.input.cashFlows.length + 1;
      }
      setCacheStatus(storageAvailable ? '本机自动保存' : '仅当前会话');
      setCacheReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!cacheReady) return;
    let nextStatus = '本机自动保存';
    try {
      window.localStorage.setItem(COMPOUND_CACHE_KEY, serializeCompoundCache(input, currency));
    } catch {
      nextStatus = '本次未保存，刷新可能丢失';
    }
    const frame = window.requestAnimationFrame(() => setCacheStatus(nextStatus));
    return () => window.cancelAnimationFrame(frame);
  }, [cacheReady, currency, input]);

  const update = <K extends keyof CompoundInput>(key: K, value: CompoundInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
  };

  const updateCashFlow = <K extends keyof CashFlowPlan>(
    id: string,
    key: K,
    value: CashFlowPlan[K],
  ) => {
    setInput((current) => ({
      ...current,
      cashFlows: current.cashFlows.map((plan) =>
        plan.id === id ? { ...plan, [key]: value } : plan,
      ),
    }));
  };

  const addCashFlow = () => {
    const durationMonths = Math.max(1, Math.ceil(durationInYears(input) * 12));
    const id = `cash-flow-${nextCashFlowId.current}`;
    nextCashFlowId.current += 1;
    setInput((current) => ({
      ...current,
      cashFlows: [
        ...current.cashFlows,
        {
          id,
          direction: 'deposit',
          amountType: 'fixed',
          amount: 500,
          startMonth: 1,
          durationMonths,
          intervalMonths: 1,
        },
      ],
    }));
  };

  const removeCashFlow = (id: string) => {
    setInput((current) => ({
      ...current,
      cashFlows: current.cashFlows.filter((plan) => plan.id !== id),
    }));
  };

  const changeAmountType = (id: string, amountType: CashFlowAmountType) => {
    setInput((current) => ({
      ...current,
      cashFlows: current.cashFlows.map((plan) =>
        plan.id === id && plan.amountType !== amountType
          ? { ...plan, amountType, amount: 0 }
          : plan,
      ),
    }));
  };

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">复利</p>
          <h1>复利计算器</h1>
          <p>输入本金与利率，按固定金额或当前资产比例模拟投入、拿走和价值走势。</p>
        </div>
        <span className="local-badge"><i className="status-dot" />仅本地计算</span>
      </header>

      <div className="calculator-layout">
        <section className="panel control-panel" aria-label="复利计算参数">
          <div className="panel-title-row">
            <h2>参数</h2>
            <div className="compound-panel-actions">
              <span className="cache-state" aria-live="polite">{cacheStatus}</span>
              <div className="field compound-currency">
                <label htmlFor="currency">币种</label>
                <select id="currency" value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
                  <option value="CNY">CNY</option>
                  <option value="USD">USD</option>
                  <option value="USDT">USDT</option>
                </select>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  nextCashFlowId.current = 2;
                  setInput(createDefaultInput());
                  setCurrency('CNY');
                }}
              >
                重置
              </button>
            </div>
          </div>

          {calculation.result ? (
            <div className="compound-mobile-summary">
              <div className="compound-mobile-summary-item">
                <span>最终价值</span>
                <strong>{formatMoney(calculation.result.finalValue, currency)}</strong>
              </div>
              <div className="compound-mobile-summary-item">
                <span>累计收益</span>
                <strong>{formatMoney(calculation.result.interest, currency)}</strong>
              </div>
            </div>
          ) : null}

          <div className="form-stack">
            <NumberField
              id="principal"
              label="本金"
              min={0}
              value={input.principal}
              onChange={(value) => update('principal', value)}
            />

            <div className="form-row">
              <NumberField
                id="annual-rate"
                label="年利率"
                value={input.annualRatePct}
                step={0.1}
                suffix="%"
                onChange={(value) => update('annualRatePct', value)}
              />
              <div className="field">
                <label htmlFor="compound-frequency">复利频率</label>
                <select
                  id="compound-frequency"
                  value={input.compoundsPerYear}
                  onChange={(event) => update('compoundsPerYear', Number(event.target.value))}
                >
                  {compoundFrequencyOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <span className="field-label">投资时长</span>
              <div className="duration-grid">
                <NumberField id="duration-years" label="年" min={0} max={200} step={1} integer value={input.years} onChange={(value) => update('years', value)} />
                <NumberField id="duration-months" label="月" min={0} max={11} step={1} integer value={input.months} onChange={(value) => update('months', value)} />
                <NumberField id="duration-days" label="日" min={0} max={364} step={1} integer value={input.days} onChange={(value) => update('days', value)} />
              </div>
            </div>

            <div className="cash-flow-section">
              <div className="cash-flow-heading">
                <div>
                  <strong>现金流计划</strong>
                  <span>分阶段投入或拿走</span>
                </div>
                <button
                  className="cash-flow-add"
                  type="button"
                  disabled={input.cashFlows.length >= 20}
                  onClick={addCashFlow}
                >
                  ＋ 添加
                </button>
              </div>

              {input.cashFlows.length > 0 ? (
                <div className="cash-flow-list">
                  {input.cashFlows.map((plan, index) => (
                    <article className="cash-flow-item" key={plan.id}>
                      <div className="cash-flow-item-header">
                        <span>计划 {String(index + 1).padStart(2, '0')}</span>
                        <button
                          type="button"
                          aria-label={`删除现金流计划 ${index + 1}`}
                          onClick={() => removeCashFlow(plan.id)}
                        >
                          删除
                        </button>
                      </div>

                      <div className="cash-flow-money-row">
                        <div className="field">
                          <label htmlFor={`${plan.id}-direction`}>类型</label>
                          <select
                            id={`${plan.id}-direction`}
                            value={plan.direction}
                            onChange={(event) =>
                              updateCashFlow(
                                plan.id,
                                'direction',
                                event.target.value as CashFlowDirection,
                              )
                            }
                          >
                            <option value="deposit">投入</option>
                            <option value="withdrawal">拿走</option>
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor={`${plan.id}-amount-type`}>计量方式</label>
                          <select
                            id={`${plan.id}-amount-type`}
                            value={plan.amountType}
                            onChange={(event) => changeAmountType(plan.id, event.target.value as CashFlowAmountType)}
                          >
                            <option value="fixed">固定金额</option>
                            <option value="percentage">当前资产百分比</option>
                          </select>
                        </div>
                        <NumberField
                          key={plan.amountType}
                          id={`${plan.id}-amount`}
                          label={plan.amountType === 'percentage' ? '每期比例' : '每期金额'}
                          min={0}
                          max={plan.amountType === 'percentage' ? 100 : undefined}
                          step={plan.amountType === 'percentage' ? 0.1 : 'any'}
                          suffix={plan.amountType === 'percentage' ? '%' : undefined}
                          value={plan.amount}
                          onChange={(value) => updateCashFlow(plan.id, 'amount', value)}
                        />
                      </div>

                      <p className="cash-flow-summary">
                        {plan.amountType === 'percentage'
                          ? '每次按当时资产计算，先计息，再投入或拿走。'
                          : '每次使用相同金额。'}
                        {' '}切换计量方式后需重新填写数值。
                      </p>

                      <div className="cash-flow-schedule-grid">
                        <NumberField
                          id={`${plan.id}-start`}
                          label="首次（月后）"
                          min={0}
                          max={2400}
                          step={1}
                          integer
                          value={plan.startMonth}
                          onChange={(value) => updateCashFlow(plan.id, 'startMonth', value)}
                        />
                        <NumberField
                          id={`${plan.id}-duration`}
                          label="持续（月）"
                          min={1}
                          max={2400}
                          step={1}
                          integer
                          value={plan.durationMonths}
                          onChange={(value) => updateCashFlow(plan.id, 'durationMonths', value)}
                        />
                        <div className="field">
                          <label htmlFor={`${plan.id}-interval`}>周期</label>
                          <select
                            id={`${plan.id}-interval`}
                            value={plan.intervalMonths}
                            onChange={(event) =>
                              updateCashFlow(plan.id, 'intervalMonths', Number(event.target.value))
                            }
                          >
                            {cashFlowIntervalOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <p className="cash-flow-summary">
                        {plan.startMonth === 0 ? '立即开始' : `${plan.startMonth} 个月后开始`}
                        {' · '}{cashFlowIntervalLabel(plan.intervalMonths)}
                        {plan.direction === 'deposit' ? '投入' : '拿走'}
                        {plan.amountType === 'percentage'
                          ? `当前资产的 ${plan.amount}%`
                          : formatMoney(plan.amount, currency)}
                        {' · '}持续 {plan.durationMonths} 个月
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="cash-flow-empty">暂无计划，仅计算初始本金。</div>
              )}
            </div>
          </div>
        </section>

        <div className="results-column">
          {calculation.error ? (
            <div className="error-box" role="alert">{calculation.error}</div>
          ) : calculation.result ? (
            <>
              <div className="metric-grid" aria-live="polite">
                <div className="metric-card primary">
                  <span className="metric-label">最终价值</span>
                  <strong className="metric-value" title={formatMoney(calculation.result.finalValue, currency)}>{formatMoney(calculation.result.finalValue, currency)}</strong>
                  <span className="metric-context">
                    {formatDuration(calculation.result.durationYears)}后 · 有效年化 {(calculation.result.effectiveAnnualRate * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">累计投入</span>
                  <strong className="metric-value" title={formatMoney(calculation.result.totalDeposits, currency)}>{formatMoney(calculation.result.totalDeposits, currency)}</strong>
                  <span className="metric-context">含初始本金 · 净投入 {formatMoney(calculation.result.invested, currency)}</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">累计拿走</span>
                  <strong className="metric-value" title={formatMoney(calculation.result.totalWithdrawals, currency)}>{formatMoney(calculation.result.totalWithdrawals, currency)}</strong>
                  <span className="metric-context">按计划从账户取出</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">累计收益</span>
                  <strong className="metric-value" title={formatMoney(calculation.result.interest, currency)}>{formatMoney(calculation.result.interest, currency)}</strong>
                  <span className="metric-context">最终价值 + 拿走 − 投入</span>
                </div>
              </div>
              <CompoundChart result={calculation.result} currency={currency} cashFlowPlans={input.cashFlows} />
              <div className="assumption-note">
                <strong>计算口径：</strong>“首次 0 个月后”表示立即执行；计划在有效区间内按周期发生，终点当天的现金流计入。同一时点的计划共用计息后、执行前的资产基数；百分比投入表示从外部追加相应资金。资产不大于 0 时，百分比投入和拿走均为 0，固定金额计划照常执行。负余额代表计划资金不足。结果是数学模拟，未计税费、手续费、通胀和市场波动。
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
