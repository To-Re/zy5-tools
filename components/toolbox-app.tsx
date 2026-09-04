'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Base64Tool } from '@/components/base64-tool';
import { Ahr999Tool } from '@/components/ahr999-tool';
import { CompoundCalculator } from '@/components/compound-calculator';
import { EscapeTool } from '@/components/escape-tool';
import { JsonDiffTool } from '@/components/json-diff-tool';
import { JsonViewerTool } from '@/components/json-viewer-tool';
import { MarketTool } from '@/components/market-tool';
import { TimestampTool } from '@/components/timestamp-tool';

type ToolId =
  | 'home'
  | 'base64'
  | 'timestamp'
  | 'json-viewer'
  | 'json-diff'
  | 'escape'
  | 'compound'
  | 'crypto-market'
  | 'ahr999'
  | 'us-market';

type ToolKind = 'local' | 'market';

const tools: Array<{
  id: Exclude<ToolId, 'home'>;
  name: string;
  description: string;
  glyph: string;
  group: string;
  keywords?: readonly string[];
  kind: ToolKind;
  status: string;
  featured?: boolean;
  ready: boolean;
}> = [
  {
    id: 'compound',
    name: '复利计算器',
    description: '复利 · 现金流计划 · 价值曲线',
    glyph: '%',
    group: '财务计算',
    kind: 'local',
    status: '本地',
    featured: true,
    ready: true,
  },
  {
    id: 'base64',
    name: '图片 Base64',
    description: '图片 ⇄ Base64 / Data URL',
    glyph: '64',
    group: '编码转换',
    kind: 'local',
    status: '本地',
    ready: true,
  },
  {
    id: 'timestamp',
    name: '时间戳',
    description: 'Unix ⇄ 本地时间 / UTC / ISO',
    glyph: 'T',
    group: '时间日期',
    kind: 'local',
    status: '本地',
    ready: true,
  },
  {
    id: 'json-viewer',
    name: 'JSON 阅读器',
    description: '格式化 · 压缩 · 结构统计',
    glyph: '{}',
    group: '数据处理',
    kind: 'local',
    status: '本地',
    ready: true,
  },
  {
    id: 'json-diff',
    name: 'JSON Diff',
    description: '语义比较 · 字段路径',
    glyph: '±',
    group: '数据处理',
    kind: 'local',
    status: '本地',
    ready: true,
  },
  {
    id: 'escape',
    name: '转义 / 反转义',
    description: 'JSON · URL · HTML · Unicode',
    glyph: '\\',
    group: '编码转换',
    kind: 'local',
    status: '本地',
    ready: true,
  },
  {
    id: 'crypto-market',
    name: '币价',
    description: '自选价格 · 搜索添加 · 按需图表',
    glyph: '₿',
    group: '行情 加密货币 Crypto USDT',
    keywords: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'BGBUSDT', 'OKBUSDT', 'ASTERUSDT', 'USDCUSDT', 'PENDLEUSDT', '币价'],
    kind: 'market',
    status: '实时',
    ready: true,
  },
  {
    id: 'ahr999',
    name: '九神指数',
    description: 'AHR999 · 估值区间 · 历史曲线',
    glyph: '9',
    group: '行情 加密货币 比特币 BTC 指标',
    keywords: ['AHR999', '九神', '酒神', '定投', '抄底'],
    kind: 'market',
    status: '每日',
    ready: true,
  },
  {
    id: 'us-market',
    name: '美股 / ETF',
    description: '自选价格 · 搜索添加 · 按需图表',
    glyph: '$',
    group: '行情 美股 股票 ETF US',
    keywords: ['AAPL', 'APPL', '苹果', 'AEHR', 'MRVL', 'MP', 'FSLR', 'MPFSLR', 'LMT', 'NOC', 'VOO', 'QQQ'],
    kind: 'market',
    status: '延迟',
    ready: true,
  },
];

const localTools = tools.filter((tool) => tool.kind === 'local');
const marketTools = tools.filter((tool) => tool.kind === 'market');

function getToolFromHash(): ToolId {
  if (typeof window === 'undefined') return 'home';
  const value = window.location.hash.slice(1) as ToolId;
  return value && tools.some((tool) => tool.id === value && tool.ready) ? value : 'home';
}

export function ToolboxApp() {
  const [activeTool, setActiveTool] = useState<ToolId>('home');
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initialTheme = window.localStorage.getItem('zy5-tools-theme') === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = initialTheme;
    const syncHash = () => setActiveTool(getToolFromHash());
    const initialFrame = window.requestAnimationFrame(() => {
      setTheme(initialTheme);
      syncHash();
    });
    window.addEventListener('hashchange', syncHash);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      window.removeEventListener('hashchange', syncHash);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        window.location.hash = '';
        setActiveTool('home');
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredTools = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tools;
    return tools.filter((tool) =>
      `${tool.name} ${tool.description} ${tool.group} ${tool.keywords?.join(' ') ?? ''}`.toLowerCase().includes(query),
    );
  }, [search]);

  const switchTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem('zy5-tools-theme', next);
  };

  const openTool = (id: ToolId) => {
    const target = tools.find((tool) => tool.id === id);
    if (id === 'home' || target?.ready) {
      window.location.hash = id === 'home' ? '' : id;
      setActiveTool(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const activeWorkspace = (() => {
    switch (activeTool) {
      case 'base64':
        return <Base64Tool />;
      case 'timestamp':
        return <TimestampTool />;
      case 'json-viewer':
        return <JsonViewerTool />;
      case 'json-diff':
        return <JsonDiffTool />;
      case 'escape':
        return <EscapeTool />;
      case 'compound':
        return <CompoundCalculator />;
      case 'crypto-market':
        return <MarketTool key="crypto" kind="crypto" theme={theme} />;
      case 'ahr999':
        return <Ahr999Tool />;
      case 'us-market':
        return <MarketTool key="us" kind="us" theme={theme} />;
      default:
        return null;
    }
  })();

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => openTool('home')} aria-label="返回工具首页">
          <span className="brand-mark">Z5</span>
          <strong>ZY5</strong><span>/ tools</span>
        </button>
        <div className="global-search">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            type="search"
            value={search}
            placeholder="搜索工具、币种或股票"
            aria-label="搜索工具"
            onChange={(event) => {
              if (activeTool !== 'home') openTool('home');
              setSearch(event.target.value);
            }}
          />
          <span className="search-shortcut">⌘ K</span>
        </div>
        <div className="top-actions">
          <span className={`privacy-status ${marketTools.some((tool) => tool.id === activeTool) ? 'external' : ''}`}>
            <i className="status-dot" />
            {marketTools.some((tool) => tool.id === activeTool) ? '第三方行情' : '仅本地处理'}
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={switchTheme}
            aria-label={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
          >
            {theme === 'light' ? '◐' : '☀'}
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="nav-section">
            <p className="nav-label">概览</p>
            <button className={`nav-item ${activeTool === 'home' ? 'active' : ''}`} type="button" onClick={() => openTool('home')}>
              <span className="nav-glyph">⌂</span>工具首页
            </button>
          </div>
          <div className="nav-section">
            <p className="nav-label">本地工具 <span>{String(localTools.length).padStart(2, '0')}</span></p>
            {localTools.map((tool) => (
              <button
                className={`nav-item ${activeTool === tool.id ? 'active' : ''}`}
                key={tool.id}
                type="button"
                aria-disabled={!tool.ready}
                onClick={() => openTool(tool.id)}
              >
                <span className="nav-glyph">{tool.glyph}</span>{tool.name}
              </button>
            ))}
          </div>
          <div className="nav-section">
            <p className="nav-label">行情 <span>{String(marketTools.length).padStart(2, '0')}</span></p>
            {marketTools.map((tool) => (
              <button
                className={`nav-item ${activeTool === tool.id ? 'active' : ''}`}
                key={tool.id}
                type="button"
                onClick={() => openTool(tool.id)}
              >
                <span className="nav-glyph">{tool.glyph}</span>{tool.name}
              </button>
            ))}
          </div>
          <div className="sidebar-note">
            <strong>运行边界</strong>
            <p>数据工具留在本地<br />行情直连第三方数据源</p>
          </div>
        </aside>

        <main className="main-content">
          {activeWorkspace ? (
            activeWorkspace
          ) : (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <p className="eyebrow">~/zy5/tools</p>
                  <h1>工具箱</h1>
                  <p className="hero-description">编码 · 解析 · 对比 · 计算 · 行情</p>
                </div>
                <div className="hero-metrics" aria-label="工具站概览">
                  <div className="hero-metric"><span>工具</span><strong>{String(tools.length).padStart(2, '0')}</strong></div>
                  <div className="hero-metric"><span>本地</span><strong>{String(localTools.length).padStart(2, '0')}</strong></div>
                  <div className="hero-metric"><span>自建后端</span><strong>0</strong></div>
                </div>
              </section>

              <div className="section-heading">
                <div>
                  <h2>{search ? '搜索结果' : '工具'}</h2>
                  <p>{search ? `${filteredTools.length} 个匹配项` : `${tools.length} 个工具。`}</p>
                </div>
              </div>

              <section className="tool-grid" aria-live="polite">
                {filteredTools.map((tool) => (
                  <button
                    className={`tool-card ${tool.featured ? 'featured' : ''}`}
                    key={tool.id}
                    type="button"
                    onClick={() => openTool(tool.id)}
                    aria-disabled={!tool.ready}
                  >
                    <span className="tool-card-top">
                      <span className="tool-icon">{tool.glyph}</span>
                      <span
                        className="tool-status"
                        data-tone={tool.kind === 'local' ? 'local' : tool.status === '实时' ? 'live' : 'delayed'}
                      >
                        {tool.ready ? tool.status : '开发中'}
                      </span>
                    </span>
                    <h3>{tool.name}</h3>
                    <p>{tool.description}</p>
                    <span className="tool-arrow" aria-hidden="true">→</span>
                  </button>
                ))}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
