'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  JsonTree,
  collectJsonContainerPaths,
  getDefaultJsonExpandedPaths,
} from '@/components/json-tree';
import { readJson, type JsonStats, type JsonValue } from '@/lib/text-tools';
import {
  JSON_VIEWER_CACHE_KEY,
  parseJsonViewerCache,
  serializeJsonViewerCache,
} from '@/lib/tool-cache';

const SAMPLE_JSON = `{
  "项目": "zy5 工具箱",
  "仅本地处理": true,
  "功能": ["格式化", "压缩", "折叠浏览"],
  "信息": {
    "版本": 1,
    "状态": "可用"
  }
}`;

const INITIAL_DOCUMENT = readJson(SAMPLE_JSON);
const EMPTY_STATS: JsonStats = {
  objectCount: 0,
  arrayCount: 0,
  keyCount: 0,
  primitiveCount: 0,
  totalNodes: 0,
  maxDepth: 0,
};

type TransformKind = 'parse' | 'format' | 'minify';

function writeJsonCache(input: string) {
  try {
    const serialized = serializeJsonViewerCache(input);
    if (serialized === null) {
      try {
        window.localStorage.removeItem(JSON_VIEWER_CACHE_KEY);
        return '内容较大，未缓存';
      } catch {
        return '内容较大，旧缓存仍保留';
      }
    }
    window.localStorage.setItem(JSON_VIEWER_CACHE_KEY, serialized);
    return '本机自动保存';
  } catch {
    try {
      window.localStorage.removeItem(JSON_VIEWER_CACHE_KEY);
      return '仅当前会话';
    } catch {
      return '保存失败，旧缓存仍保留';
    }
  }
}

export function JsonViewerTool() {
  const [input, setInput] = useState(SAMPLE_JSON);
  const [value, setValue] = useState<JsonValue | undefined>(INITIAL_DOCUMENT.value);
  const [serialized, setSerialized] = useState(INITIAL_DOCUMENT.formatted);
  const [stats, setStats] = useState<JsonStats>(INITIAL_DOCUMENT.stats);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => getDefaultJsonExpandedPaths(INITIAL_DOCUMENT.value),
  );
  const [error, setError] = useState('');
  const [copyLabel, setCopyLabel] = useState('复制 JSON');
  const [cacheReady, setCacheReady] = useState(false);
  const [cacheStatus, setCacheStatus] = useState('读取缓存…');
  const inputRef = useRef(input);

  const containerPaths = useMemo(
    () => value === undefined ? [] : collectJsonContainerPaths(value),
    [value],
  );

  useEffect(() => {
    let cachedInput: string | null = null;
    let storageAvailable = true;
    try {
      cachedInput = parseJsonViewerCache(window.localStorage.getItem(JSON_VIEWER_CACHE_KEY));
    } catch {
      storageAvailable = false;
    }

    const frame = window.requestAnimationFrame(() => {
      if (cachedInput !== null) {
        inputRef.current = cachedInput;
        setInput(cachedInput);
        if (cachedInput.trim()) {
          try {
            const document = readJson(cachedInput);
            setValue(document.value);
            setSerialized(document.formatted);
            setStats(document.stats);
            setExpandedPaths(getDefaultJsonExpandedPaths(document.value));
          } catch {
            setValue(undefined);
            setSerialized('');
            setStats(EMPTY_STATS);
            setExpandedPaths(new Set());
          }
        } else {
          setValue(undefined);
          setSerialized('');
          setStats(EMPTY_STATS);
          setExpandedPaths(new Set());
        }
      }
      setCacheStatus(storageAvailable ? '本机自动保存' : '仅当前会话');
      setCacheReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!cacheReady) return;
    const timer = window.setTimeout(() => setCacheStatus(writeJsonCache(input)), 300);
    return () => window.clearTimeout(timer);
  }, [cacheReady, input]);

  useEffect(() => () => {
    if (cacheReady) writeJsonCache(inputRef.current);
  }, [cacheReady]);

  const transform = (kind: TransformKind) => {
    try {
      const parsedDocument = readJson(input);
      const nextSerialized = kind === 'minify'
        ? parsedDocument.minified
        : parsedDocument.formatted;

      if (kind === 'format' || kind === 'minify') {
        inputRef.current = nextSerialized;
        setInput(nextSerialized);
      }

      setValue(parsedDocument.value);
      setSerialized(nextSerialized);
      setStats(parsedDocument.stats);
      setExpandedPaths(getDefaultJsonExpandedPaths(parsedDocument.value));
      setCopyLabel('复制 JSON');
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'JSON 处理失败，请检查输入。');
    }
  };

  const copyOutput = async () => {
    if (!serialized) return;
    try {
      await navigator.clipboard.writeText(serialized);
      setCopyLabel('已复制');
      window.setTimeout(() => setCopyLabel('复制 JSON'), 1400);
    } catch {
      setError('浏览器未允许访问剪贴板，请手动选择并复制。');
    }
  };

  const loadSample = () => {
    inputRef.current = SAMPLE_JSON;
    setInput(SAMPLE_JSON);
    setValue(INITIAL_DOCUMENT.value);
    setSerialized(INITIAL_DOCUMENT.formatted);
    setStats(INITIAL_DOCUMENT.stats);
    setExpandedPaths(getDefaultJsonExpandedPaths(INITIAL_DOCUMENT.value));
    setCopyLabel('复制 JSON');
    setError('');
  };

  const clear = () => {
    inputRef.current = '';
    setInput('');
    setValue(undefined);
    setSerialized('');
    setStats(EMPTY_STATS);
    setExpandedPaths(new Set());
    setCopyLabel('复制 JSON');
    setError('');
  };

  const togglePath = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">JSON</p>
          <h1>JSON 阅读器</h1>
          <p>展开、收起、检查结构。</p>
        </div>
        <span className="local-badge"><i className="status-dot" />仅本地处理</span>
      </header>

      <section className="text-tool-layout" aria-label="JSON 阅读器">
        <article className="panel editor-panel">
          <div className="panel-title-row editor-title-row">
            <div>
              <h2>原始 JSON</h2>
              <span>{input.length.toLocaleString('zh-CN')} 个字符</span>
            </div>
            <div className="cache-toolbar">
              <span className="cache-state" aria-live="polite">{cacheStatus}</span>
              <button className="ghost-button" type="button" onClick={loadSample}>载入示例</button>
            </div>
          </div>
          <textarea
            className="code-editor"
            value={input}
            spellCheck={false}
            aria-label="待解析的 JSON"
            placeholder="粘贴 JSON…"
            onChange={(event) => {
              inputRef.current = event.target.value;
              setInput(event.target.value);
              if (error) setError('');
            }}
            onBlur={(event) => setCacheStatus(writeJsonCache(event.currentTarget.value))}
          />
          <div className="editor-actions">
            <button className="primary-button" type="button" onClick={() => transform('parse')}>解析</button>
            <button className="ghost-button" type="button" onClick={() => transform('format')}>格式化</button>
            <button className="ghost-button" type="button" onClick={() => transform('minify')}>压缩</button>
            <button className="ghost-button" type="button" onClick={clear}>清空</button>
          </div>
        </article>

        <article className="panel editor-panel result-panel">
          <div className="panel-title-row editor-title-row json-tree-toolbar">
            <div>
              <h2>结构</h2>
              <span>{value === undefined ? '等待解析' : `${stats.totalNodes.toLocaleString('zh-CN')} 个节点`}</span>
            </div>
            <div className="json-tree-actions">
              <button
                className="ghost-button"
                type="button"
                disabled={containerPaths.length === 0}
                onClick={() => setExpandedPaths(new Set(containerPaths))}
              >
                全部展开
              </button>
              <button
                className="ghost-button"
                type="button"
                disabled={containerPaths.length === 0}
                onClick={() => setExpandedPaths(new Set())}
              >
                全部收起
              </button>
              <button className="ghost-button" type="button" disabled={!serialized} onClick={copyOutput}>
                {copyLabel}
              </button>
            </div>
          </div>

          <div className="code-editor result-editor json-tree-shell">
            {value === undefined ? (
              <div className="json-tree-empty">输入 JSON 后点击“解析”</div>
            ) : (
              <JsonTree value={value} expandedPaths={expandedPaths} onToggle={togglePath} />
            )}
          </div>

          <dl className="json-stat-grid" aria-label="JSON 结构统计">
            <div><dt>字段</dt><dd>{stats.keyCount}</dd></div>
            <div><dt>对象</dt><dd>{stats.objectCount}</dd></div>
            <div><dt>数组</dt><dd>{stats.arrayCount}</dd></div>
            <div><dt>最大深度</dt><dd>{stats.maxDepth}</dd></div>
          </dl>
        </article>
      </section>

      {error ? <div className="error-box tool-error" role="alert">{error}</div> : null}
    </>
  );
}
