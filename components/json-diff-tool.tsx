'use client';

import { useMemo, useState } from 'react';
import {
  diffLines,
  formatUnifiedLineDiff,
  LineDiffError,
  MAX_DIFF_CHARACTERS_PER_SIDE,
  type CharacterDiffSegment,
  type LineDiffCell,
} from '@/lib/line-diff';
import { diffJson, formatJson, type JsonDiffEntry, type JsonValue } from '@/lib/text-tools';

const LEFT_SAMPLE = `{
  "名称": "常用工具",
  "版本": 1,
  "功能": ["JSON 阅读", "时间戳"],
  "设置": { "主题": "浅色", "本地处理": true }
}`;

const RIGHT_SAMPLE = `{
  "名称": "常用工具",
  "版本": 2,
  "功能": ["JSON 阅读", "时间戳", "复利计算"],
  "设置": { "主题": "深色", "本地处理": true },
  "状态": "可用"
}`;

const TYPE_LABEL: Record<JsonDiffEntry['type'], string> = {
  added: '新增',
  removed: '删除',
  changed: '变更',
};

function displayValue(value: JsonValue | undefined) {
  if (value === undefined) return '—';
  return JSON.stringify(value, null, 2);
}

type ViewMode = 'formatted' | 'source';

function DiffCell({ cell, side }: { cell: LineDiffCell | null; side: 'left' | 'right' }) {
  if (!cell) {
    return (
      <div className={`line-diff-cell line-diff-cell-empty ${side}`} role="cell" aria-hidden="true">
        <span className="line-diff-number" />
        <code className="line-diff-code"> </code>
      </div>
    );
  }

  return (
    <div className={`line-diff-cell ${side}`} role="cell">
      <span className="line-diff-number" aria-label={`${side === 'left' ? '原版本' : '新版本'}第 ${cell.lineNumber} 行`}>
        <span className="line-diff-side" aria-hidden="true">{side === 'left' ? '原' : '新'}</span>
        {cell.lineNumber}
      </span>
      <code className="line-diff-code">
        {cell.segments.map((segment: CharacterDiffSegment, index) => (
          segment.changed
            ? <mark className="line-diff-character-change" key={`${index}-${segment.text}`}>{segment.text || ' '}</mark>
            : <span key={`${index}-${segment.text}`}>{segment.text || ' '}</span>
        ))}
      </code>
    </div>
  );
}

export function JsonDiffTool() {
  const [left, setLeft] = useState(LEFT_SAMPLE);
  const [right, setRight] = useState(RIGHT_SAMPLE);
  const [actionError, setActionError] = useState('');
  const [copyLabel, setCopyLabel] = useState('复制差异');
  const [viewMode, setViewMode] = useState<ViewMode>('formatted');

  const comparison = useMemo(() => {
    if (!left.trim() && !right.trim()) return { result: null, error: '' };
    try {
      if (
        left.length > MAX_DIFF_CHARACTERS_PER_SIDE
        || right.length > MAX_DIFF_CHARACTERS_PER_SIDE
      ) {
        throw new LineDiffError(
          `内容过大。为避免浏览器卡顿，每侧最多比较 ${MAX_DIFF_CHARACTERS_PER_SIDE.toLocaleString('zh-CN')} 个字符。`,
        );
      }
      const semantic = diffJson(left, right);
      const leftText = viewMode === 'formatted' ? formatJson(left) : left;
      const rightText = viewMode === 'formatted' ? formatJson(right) : right;
      return {
        result: {
          semantic,
          lines: diffLines(leftText, rightText),
        },
        error: '',
      };
    } catch (caught) {
      return {
        result: null,
        error: caught instanceof Error ? caught.message : 'JSON 比较失败，请检查输入。',
      };
    }
  }, [left, right, viewMode]);

  const formatSide = (side: 'left' | 'right') => {
    try {
      if (side === 'left') setLeft(formatJson(left));
      else setRight(formatJson(right));
      setActionError('');
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'JSON 格式化失败。');
    }
  };

  const copyDiff = async () => {
    if (!comparison.result) return;
    try {
      await navigator.clipboard.writeText(formatUnifiedLineDiff(comparison.result.lines));
      setCopyLabel('已复制');
      window.setTimeout(() => setCopyLabel('复制差异'), 1400);
      setActionError('');
    } catch {
      setActionError('浏览器未允许访问剪贴板，请手动选择差异内容。');
    }
  };

  const swap = () => {
    setLeft(right);
    setRight(left);
    setActionError('');
  };

  const visibleEntries = comparison.result?.semantic.entries.slice(0, 300) ?? [];
  const error = actionError || comparison.error;

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">逐行比较</p>
          <h1>JSON 对比</h1>
          <p>左右原文对齐，高亮新增、删除和修改；字段统计用于辅助定位。</p>
        </div>
        <span className="local-badge"><i className="status-dot" />仅本地处理</span>
      </header>

      <section className="diff-editors" aria-label="待比较的 JSON">
        <article className="panel editor-panel compact-editor-panel">
          <div className="panel-title-row editor-title-row">
            <div><h2>原版本</h2><span>左侧 JSON</span></div>
            <button className="ghost-button" type="button" onClick={() => formatSide('left')}>格式化</button>
          </div>
          <textarea
            className="code-editor diff-editor"
            value={left}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            aria-label="原版本 JSON"
            placeholder="粘贴原版本 JSON…"
            onChange={(event) => {
              setLeft(event.target.value);
              if (actionError) setActionError('');
            }}
          />
        </article>

        <button className="diff-swap-button" type="button" onClick={swap} aria-label="交换左右 JSON">⇄</button>

        <article className="panel editor-panel compact-editor-panel">
          <div className="panel-title-row editor-title-row">
            <div><h2>新版本</h2><span>右侧 JSON</span></div>
            <button className="ghost-button" type="button" onClick={() => formatSide('right')}>格式化</button>
          </div>
          <textarea
            className="code-editor diff-editor"
            value={right}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            aria-label="新版本 JSON"
            placeholder="粘贴新版本 JSON…"
            onChange={(event) => {
              setRight(event.target.value);
              if (actionError) setActionError('');
            }}
          />
        </article>
      </section>

      <div className="diff-actions">
        <button className="ghost-button" type="button" onClick={() => { setLeft(''); setRight(''); setActionError(''); }}>清空两侧</button>
        <button className="ghost-button" type="button" onClick={() => { setLeft(LEFT_SAMPLE); setRight(RIGHT_SAMPLE); setActionError(''); }}>恢复示例</button>
      </div>

      {error ? <div className="error-box tool-error" role="alert">{error}</div> : null}

      {comparison.result ? (
        <section className="panel diff-result-panel" aria-live="polite">
          <div className="panel-title-row diff-result-heading">
            <div>
              <h2>{comparison.result.lines.identical ? '两侧文本一致' : '逐行对比'}</h2>
              <div className="diff-summary" aria-label="逐行差异统计">
                <span className="diff-count added">+ {comparison.result.lines.added} 行新增</span>
                <span className="diff-count removed">− {comparison.result.lines.removed} 行删除</span>
                <span className="diff-count changed">~ {comparison.result.lines.changed} 行修改</span>
                <span className="diff-count semantic">{comparison.result.semantic.entries.length} 处字段差异</span>
              </div>
            </div>
            <div className="diff-result-controls">
              <div className="segmented-control" aria-label="对比视图">
                <button
                  className={viewMode === 'formatted' ? 'active' : ''}
                  type="button"
                  aria-pressed={viewMode === 'formatted'}
                  onClick={() => setViewMode('formatted')}
                >格式化视图</button>
                <button
                  className={viewMode === 'source' ? 'active' : ''}
                  type="button"
                  aria-pressed={viewMode === 'source'}
                  onClick={() => setViewMode('source')}
                >原文视图</button>
              </div>
              <button className="ghost-button" type="button" disabled={comparison.result.lines.identical} onClick={copyDiff}>{copyLabel}</button>
            </div>
          </div>

          <div className="line-diff-table" role="table" tabIndex={0} aria-label={`${viewMode === 'formatted' ? '格式化' : '原文'} JSON 逐行对比`}>
            <div className="line-diff-table-header" role="row">
              <div role="columnheader">原版本</div>
              <div role="columnheader">新版本</div>
            </div>
            <div className="line-diff-body" role="rowgroup">
              {comparison.result.lines.rows.map((row, index) => (
                <div className={`line-diff-row ${row.kind}`} role="row" key={`${row.kind}-${row.left?.lineNumber ?? 'x'}-${row.right?.lineNumber ?? 'x'}-${index}`}>
                  <DiffCell cell={row.left} side="left" />
                  <DiffCell cell={row.right} side="right" />
                </div>
              ))}
            </div>
          </div>

          <details className="semantic-diff-details">
            <summary>
              字段级差异
              <span>{comparison.result.semantic.entries.length} 处</span>
            </summary>
            {comparison.result.semantic.identical ? (
              <div className="diff-identical"><strong>字段值一致</strong><span>若上方仍有高亮，变化仅来自空白、换行或字段顺序。</span></div>
            ) : (
              <div className="diff-list semantic-diff-list">
                {visibleEntries.map((entry, index) => (
                  <article className={`diff-row ${entry.type}`} key={`${entry.path}-${entry.type}-${index}`}>
                    <div className="diff-row-heading">
                      <span className="diff-type">{TYPE_LABEL[entry.type]}</span>
                      <code>{entry.path}</code>
                    </div>
                    <div className="diff-values">
                      {entry.type !== 'added' ? <pre><span>原值</span>{displayValue(entry.before)}</pre> : null}
                      {entry.type !== 'removed' ? <pre><span>新值</span>{displayValue(entry.after)}</pre> : null}
                    </div>
                  </article>
                ))}
                {comparison.result.semantic.entries.length > visibleEntries.length ? (
                  <p className="diff-truncated">字段差异较多，仅展示前 {visibleEntries.length} 项。</p>
                ) : null}
              </div>
            )}
          </details>
        </section>
      ) : null}
    </>
  );
}
