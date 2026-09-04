'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import {
  AHR999_API_URL,
  AHR999_CACHE_KEY,
  AHR999_CACHE_TTL_MS,
  calculateAhr999Series,
  getAhr999Zone,
  getAhr999ZoneLabel,
  parseAhr999Cache,
  parseBinanceDailyKlines,
  serializeAhr999Cache,
  type Ahr999Point,
} from '@/lib/ahr999';
import styles from './ahr999-tool.module.css';

type ChartRange = '1y' | '2y' | 'all';

const RANGE_OPTIONS: Array<{ value: ChartRange; label: string; days: number | null }> = [
  { value: '1y', label: '1 年', days: 365 },
  { value: '2y', label: '2 年', days: 730 },
  { value: 'all', label: '全部', days: null },
];

function formatUsd(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatAhr(value: number) {
  return value < 0.1 ? value.toFixed(3) : value.toFixed(2);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatUpdatedAt(timestamp: number) {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}

function Ahr999Chart({ points }: { points: readonly Ahr999Point[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dateSliderId = useId();
  const width = 920;
  const height = 360;
  const margin = { top: 24, right: 66, bottom: 42, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const rawMinimum = Math.min(...points.map(({ ahr999 }) => ahr999));
  const rawMaximum = Math.max(...points.map(({ ahr999 }) => ahr999));
  const minimum = Math.max(0.01, Math.min(0.2, rawMinimum * 0.85));
  const maximum = Math.max(6, rawMaximum * 1.15);
  const logMinimum = Math.log(minimum);
  const logMaximum = Math.log(maximum);
  const x = (index: number) => margin.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const y = (value: number) => {
    const bounded = Math.max(minimum, Math.min(maximum, value));
    return margin.top + ((logMaximum - Math.log(bounded)) / (logMaximum - logMinimum)) * plotHeight;
  };
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(point.ahr999).toFixed(2)}`)
    .join(' ');
  const resolvedActiveIndex = Math.min(activeIndex ?? points.length - 1, points.length - 1);
  const active = points[resolvedActiveIndex];
  const tickValues = [0.1, 0.2, 0.45, 1.2, 5, 10].filter(
    (value) => value >= minimum && value <= maximum,
  );
  const dateTickIndexes = [...new Set([0, 1 / 3, 2 / 3, 1].map((ratio) =>
    Math.round((points.length - 1) * ratio),
  ))];
  const bands = [
    { low: minimum, high: 0.45, className: styles.bottomBand },
    { low: 0.45, high: 1.2, className: styles.dcaBand },
    { low: 1.2, high: 5, className: styles.waitBand },
    { low: 5, high: maximum, className: styles.highBand },
  ];
  const selectPoint = (clientX: number, chart: SVGSVGElement) => {
    const rect = chart.getBoundingClientRect();
    const pointerX = ((clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (pointerX - margin.left) / plotWidth));
    setActiveIndex(Math.round(ratio * (points.length - 1)));
  };

  return (
    <section className={`panel ${styles.chartPanel}`}>
      <div className={styles.chartHeader}>
        <div>
          <h2>AHR999 曲线</h2>
          <div className={styles.legend} aria-label="指标区间">
            <span><i className={styles.bottomDot} />抄底 &lt; 0.45</span>
            <span><i className={styles.dcaDot} />定投 0.45–1.2</span>
            <span><i className={styles.waitDot} />等待 &gt; 1.2</span>
          </div>
        </div>
        <div className={styles.chartReading} aria-live="polite">
          <strong>{formatAhr(active.ahr999)}</strong>
          <span>{formatDate(active.date)} · {getAhr999ZoneLabel(active.ahr999)}</span>
        </div>
      </div>

      <div className={styles.chartScroller}>
        <svg
          className={styles.chart}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`九神指数曲线，最新值 ${formatAhr(points.at(-1)!.ahr999)}`}
          onPointerMove={(event) => {
            if (event.pointerType === 'touch') return;
            selectPoint(event.clientX, event.currentTarget);
          }}
          onPointerUp={(event) => {
            if (event.pointerType === 'touch') selectPoint(event.clientX, event.currentTarget);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== 'touch') setActiveIndex(null);
          }}
        >
          {bands.map((band) => {
            const low = Math.max(minimum, band.low);
            const high = Math.min(maximum, band.high);
            if (low >= high) return null;
            return (
              <rect
                key={`${band.low}-${band.high}`}
                className={band.className}
                x={margin.left}
                y={y(high)}
                width={plotWidth}
                height={y(low) - y(high)}
              />
            );
          })}

          {tickValues.map((tick) => (
            <g key={tick}>
              <line
                className={tick === 0.45 || tick === 1.2 ? styles.thresholdLine : styles.gridLine}
                x1={margin.left}
                x2={width - margin.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text className={styles.axisText} x={margin.left - 10} y={y(tick) + 4} textAnchor="end">
                {tick}
              </text>
              {tick === 0.45 || tick === 1.2 || tick === 5 ? (
                <text className={styles.thresholdText} x={width - margin.right + 8} y={y(tick) + 4}>
                  {tick}
                </text>
              ) : null}
            </g>
          ))}

          {dateTickIndexes.map((index) => (
            <text
              className={styles.axisText}
              key={points[index].date}
              x={x(index)}
              y={height - 15}
              textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            >
              {points[index].date.slice(0, 7)}
            </text>
          ))}

          <path className={styles.area} d={`${path} L${x(points.length - 1)},${y(minimum)} L${x(0)},${y(minimum)} Z`} />
          <path className={styles.line} d={path} />
          <line
            className={styles.crosshair}
            x1={x(resolvedActiveIndex)}
            x2={x(resolvedActiveIndex)}
            y1={margin.top}
            y2={margin.top + plotHeight}
          />
          <circle className={styles.point} cx={x(resolvedActiveIndex)} cy={y(active.ahr999)} r="5" />
        </svg>
      </div>
      <div className={styles.touchControls}>
        <label htmlFor={dateSliderId}>选择日期</label>
        <input
          id={dateSliderId}
          type="range"
          min={0}
          max={points.length - 1}
          step={1}
          value={resolvedActiveIndex}
          aria-valuetext={`${formatDate(active.date)}，九神指数 ${formatAhr(active.ahr999)}`}
          onChange={(event) => setActiveIndex(Number(event.target.value))}
        />
        <p>曲线可左右滑动；拖动滑块查看每日数值。</p>
      </div>
    </section>
  );
}

export function Ahr999Tool() {
  const [points, setPoints] = useState<Ahr999Point[]>([]);
  const [range, setRange] = useState<ChartRange>('1y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState(0);
  const [dataSource, setDataSource] = useState<'network' | 'cache'>('network');
  const [refreshRequest, setRefreshRequest] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cacheFrame = 0;
    let cached = null as ReturnType<typeof parseAhr999Cache>;
    try {
      cached = parseAhr999Cache(window.localStorage.getItem(AHR999_CACHE_KEY));
    } catch {
      // 禁用本地存储时直接请求公开行情。
    }

    if (cached) {
      cacheFrame = window.requestAnimationFrame(() => {
        setPoints(cached!.points);
        setFetchedAt(cached!.fetchedAt);
        setDataSource('cache');
        if (Date.now() - cached!.fetchedAt < AHR999_CACHE_TTL_MS && refreshRequest === 0) {
          setLoading(false);
        }
      });
    }

    if (refreshRequest === 0 && cached && Date.now() - cached.fetchedAt < AHR999_CACHE_TTL_MS) {
      return () => {
        window.cancelAnimationFrame(cacheFrame);
        controller.abort();
      };
    }

    void (async () => {
      try {
        const response = await fetch(AHR999_API_URL, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 429) throw new Error('请求过于频繁，请稍后再试。');
          throw new Error(`Binance 日线请求失败（${response.status}）。`);
        }
        const payload: unknown = await response.json();
        const now = Date.now();
        const dailyCloses = parseBinanceDailyKlines(payload).filter(({ closeTime }) => closeTime < now);
        const nextPoints = calculateAhr999Series(dailyCloses);
        const nextFetchedAt = Date.now();
        window.cancelAnimationFrame(cacheFrame);
        cacheFrame = 0;
        setPoints(nextPoints);
        setFetchedAt(nextFetchedAt);
        setDataSource('network');
        setError('');
        try {
          window.localStorage.setItem(
            AHR999_CACHE_KEY,
            serializeAhr999Cache(nextPoints, nextFetchedAt),
          );
        } catch {
          // 缓存失败不影响本次展示。
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        const detail = caught instanceof Error ? caught.message : '数据加载失败。';
        setError(cached ? `${detail} 当前显示本机缓存。` : detail);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => {
      window.cancelAnimationFrame(cacheFrame);
      controller.abort();
    };
  }, [refreshRequest]);

  const visiblePoints = useMemo(() => {
    const days = RANGE_OPTIONS.find((option) => option.value === range)?.days;
    return days === null || days === undefined ? points : points.slice(-days);
  }, [points, range]);
  const latest = points.at(-1);
  const zone = latest ? getAhr999Zone(latest.ahr999) : null;

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">行情 / AHR999</p>
          <h1>九神指数</h1>
          <p>用 BTC 价格、200 日定投成本与长期拟合价格观察历史估值区间。</p>
        </div>
        <span className="local-badge"><i className="status-dot" />Binance 日线</span>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.rangeSwitch} role="group" aria-label="曲线时间范围">
          {RANGE_OPTIONS.map((option) => (
            <button
              className={range === option.value ? styles.activeRange : undefined}
              type="button"
              key={option.value}
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className={styles.refreshGroup}>
          <span>{dataSource === 'cache' ? '本机缓存' : '已更新'} · {formatUpdatedAt(fetchedAt)}</span>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setError('');
              setRefreshRequest((value) => value + 1);
            }}
          >
            {loading ? '更新中…' : '刷新'}
          </button>
        </div>
      </div>

      {error ? <div className={styles.error} role="status">{error}</div> : null}

      {latest ? (
        <>
          <div className="metric-grid" aria-live="polite">
            <div className={`metric-card primary ${styles.zoneCard}`} data-zone={zone}>
              <span className="metric-label">AHR999</span>
              <strong className="metric-value">{formatAhr(latest.ahr999)}</strong>
              <span className="metric-context">{getAhr999ZoneLabel(latest.ahr999)} · {formatDate(latest.date)}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">BTC 收盘价</span>
              <strong className="metric-value">{formatUsd(latest.close)}</strong>
              <span className="metric-context">BTCUSDT · UTC 已收盘日线</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">200 日定投成本</span>
              <strong className="metric-value">{formatUsd(latest.dcaCost)}</strong>
              <span className="metric-context">200 日收盘价几何平均</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">长期拟合价格</span>
              <strong className="metric-value">{formatUsd(latest.fittedPrice)}</strong>
              <span className="metric-context">固定经典参数 5.84 / -17.01</span>
            </div>
          </div>
          <Ahr999Chart points={visiblePoints} />
        </>
      ) : loading ? (
        <div className={styles.empty}>正在读取 BTC 日线并计算曲线…</div>
      ) : (
        <div className={styles.empty}>暂无可展示的数据。</div>
      )}

      <section className={styles.notes}>
        <p><strong>经典口径：</strong>AHR999 =（价格 / 200 日几何成本）×（价格 / 长期拟合价格）。阈值来自历史经验，不是交易信号。</p>
        <p>数据由浏览器直接请求 Binance 公开 BTCUSDT 日线；只使用已收盘 UTC 日线，结果可能与采用其他价格源或动态拟合参数的平台不同。</p>
        <div>
          <a href="https://ahr999.com/ahr999/ahr999_buy03.html" target="_blank" rel="noreferrer">九神原文 ↗</a>
          <a href="https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md" target="_blank" rel="noreferrer">Binance 数据说明 ↗</a>
        </div>
      </section>
    </>
  );
}
