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
import { filterToolCategories, toolCategories, tools, type ToolId } from '@/lib/tool-catalog';

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

  const filteredCategories = useMemo(() => filterToolCategories(search), [search]);
  const matchCount = filteredCategories.reduce((count, category) => count + category.tools.length, 0);

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
        <div className="mobile-tool-picker">
          <select
            aria-label="切换工具"
            value={activeTool}
            onChange={(event) => openTool(event.target.value as ToolId)}
          >
            <option value="home">工具首页</option>
            {toolCategories.map((category) => (
              <optgroup key={category.id} label={category.name}>
                {category.tools.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
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
          {toolCategories.map((category) => (
            <div className="nav-section" key={category.id}>
              <p className="nav-label">{category.name} <span>{category.tools.length}</span></p>
              {category.tools.map((tool) => (
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
          ))}
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
              <h1 className="sr-only">工具首页</h1>
              <div className="tool-categories" aria-live="polite">
                {search.trim() && <p className="tool-search-summary">搜索结果 · {matchCount} 个匹配项</p>}
                {filteredCategories.map((category) => (
                  <section className="tool-category" key={category.id} aria-labelledby={`category-${category.id}`}>
                    <div className="section-heading">
                      <h2 id={`category-${category.id}`}>{category.name} <span>{category.tools.length}</span></h2>
                    </div>
                    <div className="tool-grid">
                      {category.tools.map((tool) => (
                        <button
                          className="tool-card"
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
                    </div>
                  </section>
                ))}
                {matchCount === 0 && <p className="tool-empty-state">没有匹配的工具，换个关键词试试。</p>}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
