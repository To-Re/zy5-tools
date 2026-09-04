'use client';

import { useState } from 'react';
import { escapeText, unescapeText, type EscapeMode } from '@/lib/text-tools';

const SAMPLE_TEXT = '你好，ZY5 Tools!\n路径：/tools?q="local first"';

const MODES: Array<{ id: EscapeMode; label: string; hint: string }> = [
  { id: 'json', label: 'JSON', hint: '引号、换行与控制字符' },
  { id: 'url', label: 'URL', hint: 'encodeURIComponent 兼容编码' },
  { id: 'html', label: 'HTML', hint: '实体编码与数字实体解码' },
  { id: 'unicode', label: 'Unicode', hint: '\\uXXXX 与扩展码点' },
];

export function EscapeTool() {
  const [mode, setMode] = useState<EscapeMode>('json');
  const [input, setInput] = useState(SAMPLE_TEXT);
  const [output, setOutput] = useState(() => escapeText(SAMPLE_TEXT, 'json'));
  const [error, setError] = useState('');
  const [lastAction, setLastAction] = useState<'escape' | 'unescape'>('escape');
  const [copyLabel, setCopyLabel] = useState('复制结果');

  const transform = (direction: 'escape' | 'unescape') => {
    try {
      setOutput(direction === 'escape' ? escapeText(input, mode) : unescapeText(input, mode));
      setLastAction(direction);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '转换失败，请检查输入。');
    }
  };

  const selectMode = (nextMode: EscapeMode) => {
    setMode(nextMode);
    try {
      setOutput(escapeText(input, nextMode));
      setLastAction('escape');
      setError('');
    } catch {
      setOutput('');
    }
  };

  const copyOutput = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopyLabel('已复制');
      window.setTimeout(() => setCopyLabel('复制结果'), 1400);
    } catch {
      setError('浏览器未允许访问剪贴板，请手动选择并复制结果。');
    }
  };

  const activeMode = MODES.find((item) => item.id === mode)!;

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">文本转换</p>
          <h1>转义 / 反转义</h1>
          <p>在 JSON、URL、HTML 与 Unicode 表达之间转换文本，不向外部服务发送任何内容。</p>
        </div>
        <span className="local-badge"><i className="status-dot" />仅本地处理</span>
      </header>

      <section className="panel transform-panel" aria-label="转义工具">
        <div className="mode-selector-wrap">
          <div className="segmented-control" role="group" aria-label="选择转义格式">
            {MODES.map((item) => (
              <button
                className={mode === item.id ? 'active' : ''}
                key={item.id}
                type="button"
                aria-pressed={mode === item.id}
                onClick={() => selectMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="mode-hint">{activeMode.hint}</span>
        </div>

        <div className="transform-layout">
          <article className="transform-editor">
            <div className="editor-label-row">
              <label htmlFor="escape-input">输入</label>
              <span>{input.length.toLocaleString('zh-CN')} 个字符</span>
            </div>
            <textarea
              id="escape-input"
              className="code-editor transform-textarea"
              value={input}
              spellCheck={false}
              placeholder="输入或粘贴要处理的文本…"
              onChange={(event) => {
                setInput(event.target.value);
                if (error) setError('');
              }}
            />
          </article>

          <div className="transform-actions" aria-label="转换方向">
            <button className="primary-button" type="button" onClick={() => transform('escape')}>
              转义 <span aria-hidden="true">→</span>
            </button>
            <button className="ghost-button" type="button" onClick={() => transform('unescape')}>
              反转义 <span aria-hidden="true">→</span>
            </button>
            <button
              className="swap-button"
              type="button"
              aria-label="交换输入与结果"
              onClick={() => {
                setInput(output);
                setOutput(input);
                setError('');
              }}
            >
              ⇄
            </button>
          </div>

          <article className="transform-editor">
            <div className="editor-label-row">
              <label htmlFor="escape-output">{lastAction === 'escape' ? '转义结果' : '反转义结果'}</label>
              <span>{output.length.toLocaleString('zh-CN')} 个字符</span>
            </div>
            <textarea
              id="escape-output"
              className="code-editor transform-textarea result-editor"
              value={output}
              spellCheck={false}
              placeholder="转换结果会显示在这里"
              readOnly
            />
          </article>
        </div>

        <div className="editor-actions transform-footer">
          <button className="ghost-button" type="button" onClick={() => { setInput(SAMPLE_TEXT); setOutput(escapeText(SAMPLE_TEXT, mode)); setLastAction('escape'); setError(''); }}>恢复示例</button>
          <button className="ghost-button" type="button" onClick={() => { setInput(''); setOutput(''); setError(''); }}>清空</button>
          <button className="primary-button" type="button" disabled={!output} onClick={copyOutput}>{copyLabel}</button>
        </div>
      </section>

      {error ? <div className="error-box tool-error" role="alert">{error}</div> : null}
    </>
  );
}
