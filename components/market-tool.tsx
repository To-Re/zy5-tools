'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  buildMarketOverviewUrl,
  buildTradingViewChartUrl,
  createMarketSymbol,
  getMarketProfile,
  migrateLegacyMarketWatchlist,
  moveMarketSymbol,
  type MarketKind,
  type MarketSymbol,
  type MarketTheme,
} from '@/lib/market-symbols';
import styles from './market-tool.module.css';

export interface MarketToolProps {
  kind: MarketKind;
  theme: MarketTheme;
}

type MarketViewMode = 'compact' | 'professional';
const WATCHLIST_LIMIT = 20;
const WATCHLIST_STORAGE_VERSION = 2;

function parseStoredWatchlist(raw: string | null): MarketSymbol[] | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  return parsed
    .filter((item): item is MarketSymbol => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<MarketSymbol>;
      return (
        typeof candidate.symbol === 'string' &&
        /^[A-Z0-9._:-]{1,40}$/.test(candidate.symbol) &&
        typeof candidate.code === 'string' &&
        /^[A-Z0-9._-]{1,32}$/.test(candidate.code) &&
        typeof candidate.name === 'string'
      );
    })
    .slice(0, WATCHLIST_LIMIT)
    .map((item) => ({ ...item, name: item.name.slice(0, 80) }))
    .filter(
      (item, index, items) =>
        items.findIndex((candidate) => candidate.symbol === item.symbol) === index,
    );
}

function readStoredWatchlist(kind: MarketKind): MarketSymbol[] | null {
  try {
    const current = parseStoredWatchlist(
      window.localStorage.getItem(`zy5-tools-watchlist-v${WATCHLIST_STORAGE_VERSION}:${kind}`),
    );
    if (current !== null) return current;

    const legacy = parseStoredWatchlist(window.localStorage.getItem(`zy5-tools-watchlist-v1:${kind}`));
    return legacy === null ? null : migrateLegacyMarketWatchlist(kind, legacy);
  } catch {
    return null;
  }
}

export function MarketTool({ kind, theme }: MarketToolProps) {
  const profile = getMarketProfile(kind);
  const [viewMode, setViewMode] = useState<MarketViewMode>('compact');
  const [reordering, setReordering] = useState(false);
  const [watchlist, setWatchlist] = useState<MarketSymbol[]>(() =>
    profile.symbols.map((item) => ({ ...item })),
  );
  const [watchlistReady, setWatchlistReady] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(profile.symbols[0].symbol);
  const [query, setQuery] = useState('');
  const [queryError, setQueryError] = useState('');
  const [chartLoading, setChartLoading] = useState(true);
  const overviewUrl = useMemo(
    () => buildMarketOverviewUrl(kind, theme, watchlist),
    [kind, theme, watchlist],
  );
  const chartUrl = useMemo(
    () => selectedSymbol ? buildTradingViewChartUrl(selectedSymbol, kind, theme) : '',
    [kind, selectedSymbol, theme],
  );
  const isProfessional = viewMode === 'professional';

  useEffect(() => {
    const stored = readStoredWatchlist(kind);
    const frame = window.requestAnimationFrame(() => {
      if (stored) {
        setWatchlist(stored);
        setSelectedSymbol((current) =>
          stored.some((item) => item.symbol === current) ? current : stored[0]?.symbol ?? '',
        );
      }
      setWatchlistReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [kind]);

  useEffect(() => {
    if (!watchlistReady) return;
    try {
      window.localStorage.setItem(
        `zy5-tools-watchlist-v${WATCHLIST_STORAGE_VERSION}:${kind}`,
        JSON.stringify(watchlist),
      );
    } catch {
      // 浏览器禁用本地存储时，当前页面仍可正常维护临时自选。
    }
  }, [kind, watchlist, watchlistReady]);

  const openSymbol = (symbol: string, visibleCode?: string) => {
    const symbolChanged = symbol !== selectedSymbol;
    setSelectedSymbol(symbol);
    setQuery(visibleCode ?? symbol.replace(/^.*:/, ''));
    setQueryError('');
    if (symbolChanged) setChartLoading(true);
  };

  const submitWatchlist = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const item = createMarketSymbol(kind, query);
      const exists = watchlist.some((current) => current.symbol === item.symbol);
      if (!exists && watchlist.length >= WATCHLIST_LIMIT) {
        setQueryError(`自选最多保留 ${WATCHLIST_LIMIT} 个。`);
        return;
      }
      if (!exists) setWatchlist((current) => [...current, item]);
      openSymbol(item.symbol, '');
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : '无法识别该代码。');
    }
  };

  const removeSymbol = (symbol: string) => {
    const remaining = watchlist.filter((item) => item.symbol !== symbol);
    setWatchlist(remaining);
    if (selectedSymbol === symbol) {
      setSelectedSymbol(remaining[0]?.symbol ?? '');
      setChartLoading(true);
    }
  };

  const moveSymbol = (symbol: string, offset: -1 | 1) => {
    setWatchlist((current) => moveMarketSymbol(current, symbol, offset));
  };

  const restoreDefaults = () => {
    const defaults = profile.symbols.map((item) => ({ ...item }));
    const nextSelectedSymbol = defaults[0]?.symbol ?? '';
    setWatchlist(defaults);
    setSelectedSymbol(nextSelectedSymbol);
    setQuery('');
    setQueryError('');
    setReordering(false);
    if (nextSelectedSymbol !== selectedSymbol) setChartLoading(true);
  };

  return (
    <section className={styles.workspace} aria-labelledby={`${kind}-market-title`}>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{profile.eyebrow}</p>
          <h1 id={`${kind}-market-title`}>{profile.title}</h1>
          <p>
            {isProfessional
              ? `${watchlist.length} 个自选标的；点击代码切图，也可继续搜索加入。`
              : `${watchlist.length} 个自选标的一屏查看；蜡烛图默认收起。`}
          </p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.modeSwitch} role="group" aria-label="行情展示模式">
            <button
              className={!isProfessional ? styles.activeMode : undefined}
              type="button"
              aria-pressed={!isProfessional}
              onClick={() => setViewMode('compact')}
            >
              简洁
            </button>
            <button
              className={isProfessional ? styles.activeMode : undefined}
              type="button"
              aria-pressed={isProfessional}
              onClick={() => setViewMode('professional')}
            >
              专业
            </button>
          </div>
          <span className={`${styles.badge} ${styles[profile.dataTone]}`}>
            {profile.dataLabel}
          </span>
        </div>
      </header>

      <div className={`${styles.marketGrid} ${isProfessional ? styles.professionalGrid : styles.compactGrid}`}>
        <section className={`${styles.panel} ${styles.overviewPanel}`} aria-labelledby={`${kind}-watch-title`}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.kicker}>WATCHLIST</span>
              <h2 id={`${kind}-watch-title`}>自选</h2>
            </div>
            <div className={styles.watchlistHeaderActions}>
              <span className={styles.count}>{String(watchlist.length).padStart(2, '0')}</span>
              <button
                className={reordering ? styles.activeReorder : undefined}
                type="button"
                disabled={watchlist.length < 2}
                aria-pressed={reordering}
                onClick={() => setReordering((current) => !current)}
              >
                {reordering ? '完成' : '调整顺序'}
              </button>
              <button type="button" onClick={restoreDefaults}>恢复默认</button>
            </div>
          </div>
          <form className={styles.watchlistSearch} onSubmit={submitWatchlist} noValidate>
            <label className={styles.srOnly} htmlFor={`${kind}-watchlist-search`}>搜索并加入自选</label>
            <input
              id={`${kind}-watchlist-search`}
              value={query}
              placeholder={kind === 'crypto' ? '输入币种，如 BNB' : '输入代码，如 TSLA'}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setQuery(event.target.value);
                if (queryError) setQueryError('');
              }}
            />
            <button type="submit">加入</button>
          </form>

          {queryError ? <p className={styles.queryError} role="alert">{queryError}</p> : null}

          {!watchlistReady ? (
            <div className={styles.emptyWatchlist}>正在读取本地自选…</div>
          ) : watchlist.length > 0 ? (
            <>
              <div className={styles.symbolBar} aria-label="我的自选">
                {watchlist.map((item, index) => (
                  <span className={styles.symbolChip} key={item.symbol}>
                    {reordering ? (
                      <button
                        className={styles.moveSymbol}
                        type="button"
                        disabled={index === 0}
                        aria-label={`将 ${item.code} 前移`}
                        onClick={() => moveSymbol(item.symbol, -1)}
                      >
                        ‹
                      </button>
                    ) : null}
                    <button
                      className={item.symbol === selectedSymbol ? styles.activeSymbol : undefined}
                      title={isProfessional ? `查看 ${item.name} 图表` : item.name}
                      type="button"
                      onClick={() => openSymbol(item.symbol, '')}
                    >
                      {item.code}
                    </button>
                    {reordering ? (
                      <button
                        className={styles.moveSymbol}
                        type="button"
                        disabled={index === watchlist.length - 1}
                        aria-label={`将 ${item.code} 后移`}
                        onClick={() => moveSymbol(item.symbol, 1)}
                      >
                        ›
                      </button>
                    ) : (
                      <button
                        className={styles.removeSymbol}
                        type="button"
                        aria-label={`从自选移除 ${item.code}`}
                        onClick={() => removeSymbol(item.symbol)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {reordering ? <p className={styles.orderHint}>使用 ‹ › 调整，顺序自动保存。</p> : null}
              <div className={`${styles.overviewFrame} ${styles[kind]}`}>
                <iframe
                  key={overviewUrl}
                  src={overviewUrl}
                  title={`TradingView ${profile.title}自选行情`}
                  loading="eager"
                  referrerPolicy="origin-when-cross-origin"
                />
              </div>
            </>
          ) : (
            <div className={styles.emptyWatchlist}>输入代码，建立你的自选列表。</div>
          )}
        </section>

        {isProfessional ? (
          <section className={`${styles.panel} ${styles.chartPanel}`} aria-labelledby={`${kind}-chart-title`}>
            <div className={styles.chartHeader}>
              <div>
                <span className={styles.kicker}>CHART</span>
                <h2 id={`${kind}-chart-title`}>专业图表</h2>
              </div>
              <div className={styles.chartControls}>
                <span className={styles.selectedCode}>
                  {watchlist.find((item) => item.symbol === selectedSymbol)?.code ?? '未选择'}
                </span>
                <button
                  className={styles.collapseButton}
                  type="button"
                  onClick={() => setViewMode('compact')}
                >
                  收起
                </button>
              </div>
            </div>

            {selectedSymbol ? (
              <div className={styles.chartFrame} aria-busy={chartLoading}>
                {chartLoading ? <div className={styles.loading}>正在连接行情…</div> : null}
                <iframe
                  key={chartUrl}
                  src={chartUrl}
                  title={`TradingView ${profile.title}行情图表`}
                  loading="eager"
                  allowFullScreen
                  referrerPolicy="origin-when-cross-origin"
                  onLoad={() => setChartLoading(false)}
                />
              </div>
            ) : (
              <div className={styles.emptyChart}>先从左侧搜索并加入一个标的。</div>
            )}
          </section>
        ) : null}
      </div>

      {!isProfessional ? (
        <div className={styles.compactActions}>
          <p>自选保存在当前浏览器。简洁模式不加载 K 线，需要时再展开。</p>
          <button type="button" onClick={() => setViewMode('professional')}>
            打开专业模式
          </button>
        </div>
      ) : null}

      <footer className={styles.footer}>
        <p>{profile.dataNote} 本页会直接请求 TradingView。</p>
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView 数据 ↗
        </a>
      </footer>
    </section>
  );
}
