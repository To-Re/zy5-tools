'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  calculateCompound,
  durationInYears,
  type CashFlowDirection,
  type CashFlowPlan,
  type CompoundInput,
  type CompoundPoint,
  type CompoundResult,
} from '@/lib/compound';
import {
  COMPOUND_CACHE_KEY,
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

function formatMoney(value: number, currency: Currency, compact = false) {
  if (!Number.isFinite(value)) return '—';
  const maximumFractionDigits = compact ? 1 : Math.abs(value) < 100 ? 2 : 0;
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
  if (timeYears < 1 / 12) return `${Math.round(timeYears * 365)} 天`;
  if (timeYears < 1) return `${Math.round(timeYears * 12)} 个月`;
  const years = Math.floor(timeYears);
  const months = Math.round((timeYears - years) * 12);
  return months > 0 ? `${years} 年 ${months} 个月` : `${years} 年`;
}

function CompoundChart({ result, currency }: { result: CompoundResult; currency: Currency }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 900;
  const height = 320;
  const margin = { top: 24, right: 18, bottom: 45, left: 70 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = result.points.flatMap((point) => [point.total, point.invested]);
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
    result.points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${x(point).toFixed(2)},${y(point[key]).toFixed(2)}`,
      )
      .join(' ');
  const area = `${line('total')} ${result.points
    .slice()
    .reverse()
    .map((point) => `L${x(point).toFixed(2)},${y(point.invested).toFixed(2)}`)
    .join(' ')} Z`;
  const resolvedActiveIndex = activeIndex ?? result.points.length - 1;
  const active = result.points[Math.min(resolvedActiveIndex, result.points.length - 1)];
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => minimum + ((maximum - minimum) * index) / 4,
  );
  const xTicks = Array.from({ length: 5 }, (_, index) => (result.durationYears * index) / 4);

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

      <svg
        className="compound-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`复利价值走势，最终价值 ${formatMoney(result.finalValue, currency)}，净投入 ${formatMoney(result.invested, currency)}`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const pointerX = ((event.clientX - rect.left) / rect.width) * width;
          const ratio = Math.max(0, Math.min(1, (pointerX - margin.left) / plotWidth));
          setActiveIndex(Math.round(ratio * (result.points.length - 1)));
        }}
        onPointerLeave={() => setActiveIndex(null)}
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
      cached = parseCompoundCache(window.localStorage.getItem(COMPOUND_CACHE_KEY));
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
      try {
        window.localStorage.removeItem(COMPOUND_CACHE_KEY);
        nextStatus = '仅当前会话';
      } catch {
        nextStatus = '保存失败，旧缓存仍保留';
      }
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

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">复利</p>
          <h1>复利计算器</h1>
          <p>输入本金与利率，用多条现金流计划模拟投入、拿走和价值走势。</p>
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
                        <NumberField
                          id={`${plan.id}-amount`}
                          label="每期金额"
                          min={0}
                          value={plan.amount}
                          onChange={(value) => updateCashFlow(plan.id, 'amount', value)}
                        />
                      </div>

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
              <CompoundChart result={calculation.result} currency={currency} />
              <div className="assumption-note">
                <strong>计算口径：</strong>“首次 0 个月后”表示立即执行；计划在有效区间内按周期发生，终点当天的现金流计入。负余额代表计划资金不足。结果是数学模拟，未计税费、手续费、通胀和市场波动。
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
