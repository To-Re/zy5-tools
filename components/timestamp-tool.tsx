'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface ParsedTimestamp {
  date: Date | null;
  error: string | null;
  milliseconds: number | null;
  unit: '秒' | '毫秒' | null;
}

function toDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds()),
  ].join('');
}

function parseTimestamp(value: string): ParsedTimestamp {
  const trimmed = value.trim();
  if (!trimmed) return { date: null, error: null, milliseconds: null, unit: null };
  if (!/^\d+$/.test(trimmed)) {
    return { date: null, error: '时间戳只能包含数字。', milliseconds: null, unit: null };
  }
  if (trimmed.length !== 10 && trimmed.length !== 13) {
    return { date: null, error: '请输入 10 位秒级或 13 位毫秒级 Unix 时间戳。', milliseconds: null, unit: null };
  }

  const numeric = Number(trimmed);
  const milliseconds = trimmed.length === 10 ? numeric * 1000 : numeric;
  const date = new Date(milliseconds);
  if (!Number.isFinite(milliseconds) || Number.isNaN(date.getTime())) {
    return { date: null, error: '该时间戳超出可转换范围。', milliseconds: null, unit: null };
  }
  return { date, error: null, milliseconds, unit: trimmed.length === 10 ? '秒' : '毫秒' };
}

function formatLocal(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(date);
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function CopyButton({
  copyKey,
  copiedKey,
  label = '复制',
  value,
  onCopy,
}: {
  copyKey: string;
  copiedKey: string | null;
  label?: string;
  value: string;
  onCopy: (copyKey: string, value: string) => void;
}) {
  return (
    <button className="mini-copy-button" type="button" disabled={!value} onClick={() => onCopy(copyKey, value)}>
      {copiedKey === copyKey ? '已复制' : label}
    </button>
  );
}

export function TimestampTool() {
  const [now, setNow] = useState<number | null>(null);
  const [timestampInput, setTimestampInput] = useState('');
  const [dateTimeInput, setDateTimeInput] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      const initialNow = Date.now();
      setNow(initialNow);
      setTimestampInput(String(Math.floor(initialNow / 1000)));
      setDateTimeInput(toDateTimeLocal(new Date(initialNow)));
    }, 0);
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.clearTimeout(initialize);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
  }, []);

  const parsedTimestamp = useMemo(() => parseTimestamp(timestampInput), [timestampInput]);
  const localDate = useMemo(() => {
    if (!dateTimeInput) return null;
    const date = new Date(dateTimeInput);
    return Number.isNaN(date.getTime()) ? null : date;
  }, [dateTimeInput]);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时区', []);

  const handleCopy = (copyKey: string, value: string) => {
    if (!value) return;
    void copyText(value).then(() => {
      setCopyError(null);
      setCopiedKey(copyKey);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedKey(null), 1500);
    }).catch(() => setCopyError('复制失败，请手动选择内容复制。'));
  };

  const setCurrentExample = () => {
    const current = Date.now();
    setTimestampInput(String(Math.floor(current / 1000)));
    setDateTimeInput(toDateTimeLocal(new Date(current)));
  };

  const currentSeconds = now === null ? '' : String(Math.floor(now / 1000));
  const currentMilliseconds = now === null ? '' : String(now);
  const parsedDate = parsedTimestamp.date;
  const localSeconds = localDate ? String(Math.floor(localDate.getTime() / 1000)) : '';
  const localMilliseconds = localDate ? String(localDate.getTime()) : '';

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Unix 时间转换</p>
          <h1>时间戳</h1>
          <p>查看当前 Unix 时间，并在秒、毫秒、本地时间、UTC 与 ISO 8601 之间快速转换。</p>
        </div>
        <span className="local-badge"><i className="status-dot" />时区：{timeZone}</span>
      </header>

      <section className="timestamp-now" aria-label="当前 Unix 时间" aria-live="off">
        <div className="timestamp-now-copy">
          <span className="timestamp-live-dot" aria-hidden="true" />
          <div><strong>当前 Unix 时间</strong><span>每秒自动更新</span></div>
        </div>
        <div className="timestamp-value">
          <span>秒</span>
          <strong>{currentSeconds || '—'}</strong>
          <CopyButton copyKey="now-seconds" copiedKey={copiedKey} value={currentSeconds} onCopy={handleCopy} />
        </div>
        <div className="timestamp-value">
          <span>毫秒</span>
          <strong>{currentMilliseconds || '—'}</strong>
          <CopyButton copyKey="now-milliseconds" copiedKey={copiedKey} value={currentMilliseconds} onCopy={handleCopy} />
        </div>
      </section>

      {copyError ? <div className="error-box" role="alert">{copyError}</div> : null}

      <div className="timestamp-layout">
        <section className="panel tool-panel" aria-labelledby="timestamp-to-date-title">
          <div className="panel-title-row">
            <div>
              <h2 id="timestamp-to-date-title">时间戳 → 日期时间</h2>
              <p className="panel-description">输入 10 位秒级或 13 位毫秒级时间戳，自动识别单位。</p>
            </div>
            <button className="ghost-button" type="button" onClick={setCurrentExample}>使用现在</button>
          </div>

          <label className="field timestamp-input-field" htmlFor="timestamp-input">
            <span className="field-label">Unix 时间戳</span>
            <div className="input-shell timestamp-input-shell">
              <input
                id="timestamp-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={timestampInput}
                placeholder="例如 1788436800"
                onChange={(event) => setTimestampInput(event.target.value.replace(/\s/g, ''))}
              />
              <span className="input-suffix">{parsedTimestamp.unit ?? '自动识别'}</span>
            </div>
          </label>

          {parsedTimestamp.error ? <div className="inline-error" role="alert">{parsedTimestamp.error}</div> : null}

          <dl className="conversion-results" aria-live="polite">
            <div>
              <dt>Local · {timeZone}</dt>
              <dd>{parsedDate ? formatLocal(parsedDate) : '—'}</dd>
              <CopyButton copyKey="parsed-local" copiedKey={copiedKey} value={parsedDate ? formatLocal(parsedDate) : ''} onCopy={handleCopy} />
            </div>
            <div>
              <dt>UTC</dt>
              <dd>{parsedDate ? parsedDate.toUTCString() : '—'}</dd>
              <CopyButton copyKey="parsed-utc" copiedKey={copiedKey} value={parsedDate ? parsedDate.toUTCString() : ''} onCopy={handleCopy} />
            </div>
            <div>
              <dt>ISO 8601</dt>
              <dd>{parsedDate ? parsedDate.toISOString() : '—'}</dd>
              <CopyButton copyKey="parsed-iso" copiedKey={copiedKey} value={parsedDate ? parsedDate.toISOString() : ''} onCopy={handleCopy} />
            </div>
          </dl>
        </section>

        <section className="panel tool-panel" aria-labelledby="date-to-timestamp-title">
          <div className="panel-title-row">
            <div>
              <h2 id="date-to-timestamp-title">日期时间 → 时间戳</h2>
              <p className="panel-description">输入按当前设备时区解释，结果同时给出秒与毫秒。</p>
            </div>
          </div>

          <label className="field" htmlFor="datetime-input">
            <span className="field-label">本地日期时间</span>
            <input
              className="datetime-input"
              id="datetime-input"
              type="datetime-local"
              step="1"
              value={dateTimeInput}
              onChange={(event) => setDateTimeInput(event.target.value)}
            />
          </label>

          {!localDate && dateTimeInput ? <div className="inline-error" role="alert">日期时间格式无效。</div> : null}

          <dl className="conversion-results timestamp-number-results" aria-live="polite">
            <div>
              <dt>秒级时间戳</dt>
              <dd>{localSeconds || '—'}</dd>
              <CopyButton copyKey="local-seconds" copiedKey={copiedKey} value={localSeconds} onCopy={handleCopy} />
            </div>
            <div>
              <dt>毫秒级时间戳</dt>
              <dd>{localMilliseconds || '—'}</dd>
              <CopyButton copyKey="local-milliseconds" copiedKey={copiedKey} value={localMilliseconds} onCopy={handleCopy} />
            </div>
          </dl>

          {localDate ? (
            <div className="timestamp-context">
              <span>对应 UTC</span>
              <strong>{localDate.toUTCString()}</strong>
            </div>
          ) : null}
        </section>
      </div>

      <div className="assumption-note">
        Unix 时间戳不包含时区；时区只影响日期时间的显示和输入解释。10 位按秒、13 位按毫秒处理。
      </div>
    </>
  );
}
