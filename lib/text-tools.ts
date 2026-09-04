export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface JsonStats {
  objectCount: number;
  arrayCount: number;
  keyCount: number;
  primitiveCount: number;
  totalNodes: number;
  maxDepth: number;
}

export interface ParsedJsonDocument {
  value: JsonValue;
  formatted: string;
  minified: string;
  stats: JsonStats;
}

export type JsonDiffType = 'added' | 'removed' | 'changed';

export interface JsonDiffEntry {
  path: string;
  type: JsonDiffType;
  before?: JsonValue;
  after?: JsonValue;
}

export interface JsonDiffResult {
  entries: JsonDiffEntry[];
  added: number;
  removed: number;
  changed: number;
  identical: boolean;
}

export type EscapeMode = 'json' | 'url' | 'html' | 'unicode';

export class TextToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TextToolError';
  }
}

function jsonErrorMessage(error: unknown, source: string, label: string) {
  const fallback = error instanceof Error ? error.message : '内容不是合法 JSON。';
  const positionMatch = fallback.match(/position\s+(\d+)/i);

  const lineColumnMatch = fallback.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColumnMatch) {
    return `${label}解析失败：第 ${lineColumnMatch[1]} 行，第 ${lineColumnMatch[2]} 列附近格式有误。`;
  }

  if (!positionMatch) {
    return `${label}解析失败：内容不是合法 JSON，请检查引号、逗号和括号。`;
  }

  const position = Math.min(Number(positionMatch[1]), source.length);
  const before = source.slice(0, position);
  const lines = before.split('\n');
  return `${label}解析失败：第 ${lines.length} 行，第 ${lines.at(-1)!.length + 1} 列附近格式有误。`;
}

export function parseJson(input: string, label = 'JSON'): JsonValue {
  if (!input.trim()) {
    throw new TextToolError(`请输入${label}内容。`);
  }

  try {
    return JSON.parse(input) as JsonValue;
  } catch (error) {
    throw new TextToolError(jsonErrorMessage(error, input, label));
  }
}

export function getJsonStats(value: JsonValue): JsonStats {
  const stats: JsonStats = {
    objectCount: 0,
    arrayCount: 0,
    keyCount: 0,
    primitiveCount: 0,
    totalNodes: 0,
    maxDepth: 0,
  };

  const visit = (current: JsonValue, depth: number) => {
    stats.totalNodes += 1;
    stats.maxDepth = Math.max(stats.maxDepth, depth);

    if (Array.isArray(current)) {
      stats.arrayCount += 1;
      current.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (current !== null && typeof current === 'object') {
      stats.objectCount += 1;
      const entries = Object.entries(current);
      stats.keyCount += entries.length;
      entries.forEach(([, item]) => visit(item, depth + 1));
      return;
    }

    stats.primitiveCount += 1;
  };

  visit(value, 1);
  return stats;
}

export function readJson(input: string, indent = 2): ParsedJsonDocument {
  const value = parseJson(input);
  return {
    value,
    formatted: JSON.stringify(value, null, indent),
    minified: JSON.stringify(value),
    stats: getJsonStats(value),
  };
}

export function formatJson(input: string, indent = 2) {
  return readJson(input, indent).formatted;
}

export function minifyJson(input: string) {
  return readJson(input).minified;
}

function isObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function childPath(parent: string, key: string) {
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

function diffValues(before: JsonValue, after: JsonValue, path: string, entries: JsonDiffEntry[]) {
  if (Object.is(before, after)) return;

  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      const nextPath = `${path}[${index}]`;
      if (index >= before.length) {
        entries.push({ path: nextPath, type: 'added', after: after[index] });
      } else if (index >= after.length) {
        entries.push({ path: nextPath, type: 'removed', before: before[index] });
      } else {
        diffValues(before[index], after[index], nextPath, entries);
      }
    }
    return;
  }

  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((a, b) =>
      a.localeCompare(b),
    );
    for (const key of keys) {
      const nextPath = childPath(path, key);
      const existedBefore = Object.prototype.hasOwnProperty.call(before, key);
      const existsAfter = Object.prototype.hasOwnProperty.call(after, key);
      if (!existedBefore) {
        entries.push({ path: nextPath, type: 'added', after: after[key] });
      } else if (!existsAfter) {
        entries.push({ path: nextPath, type: 'removed', before: before[key] });
      } else {
        diffValues(before[key], after[key], nextPath, entries);
      }
    }
    return;
  }

  entries.push({ path, type: 'changed', before, after });
}

export function diffJson(leftInput: string, rightInput: string): JsonDiffResult {
  const before = parseJson(leftInput, '左侧 JSON');
  const after = parseJson(rightInput, '右侧 JSON');
  const entries: JsonDiffEntry[] = [];
  diffValues(before, after, '$', entries);

  return {
    entries,
    added: entries.filter((entry) => entry.type === 'added').length,
    removed: entries.filter((entry) => entry.type === 'removed').length,
    changed: entries.filter((entry) => entry.type === 'changed').length,
    identical: entries.length === 0,
  };
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(input: string) {
  return input.replace(/[&<>"']/g, (character) => HTML_ESCAPE_MAP[character]);
}

function unescapeHtml(input: string) {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    '#39': "'",
  };

  return input.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, (entity, code: string) => {
    const normalized = code.toLowerCase();
    if (normalized in named) return named[normalized];

    const radix = normalized.startsWith('#x') ? 16 : 10;
    const rawNumber = normalized.slice(radix === 16 ? 2 : 1);
    const codePoint = Number.parseInt(rawNumber, radix);
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;

    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return entity;
    }
  });
}

function hex(value: number, length: number) {
  return value.toString(16).toUpperCase().padStart(length, '0');
}

function escapeUnicode(input: string) {
  let output = '';
  for (const character of input) {
    const codePoint = character.codePointAt(0)!;
    if (character === '\\') output += '\\\\';
    else if (character === '\n') output += '\\n';
    else if (character === '\r') output += '\\r';
    else if (character === '\t') output += '\\t';
    else if (codePoint >= 0x20 && codePoint <= 0x7e) output += character;
    else if (codePoint <= 0xffff) output += `\\u${hex(codePoint, 4)}`;
    else {
      const offset = codePoint - 0x10000;
      output += `\\u${hex(0xd800 + (offset >> 10), 4)}\\u${hex(0xdc00 + (offset & 0x3ff), 4)}`;
    }
  }
  return output;
}

function unescapeUnicode(input: string) {
  let output = '';
  let index = 0;
  const shortEscapes: Record<string, string> = {
    '\\': '\\',
    n: '\n',
    r: '\r',
    t: '\t',
    b: '\b',
    f: '\f',
    v: '\v',
    '0': '\0',
  };

  while (index < input.length) {
    if (input[index] !== '\\' || index === input.length - 1) {
      output += input[index];
      index += 1;
      continue;
    }

    const next = input[index + 1];
    if (next in shortEscapes) {
      output += shortEscapes[next];
      index += 2;
      continue;
    }

    if (next === 'u' && input[index + 2] === '{') {
      const closing = input.indexOf('}', index + 3);
      const raw = closing === -1 ? '' : input.slice(index + 3, closing);
      if (/^[\da-fA-F]{1,6}$/.test(raw)) {
        const codePoint = Number.parseInt(raw, 16);
        if (codePoint <= 0x10ffff) {
          output += String.fromCodePoint(codePoint);
          index = closing + 1;
          continue;
        }
      }
    }

    if (next === 'u') {
      const raw = input.slice(index + 2, index + 6);
      if (/^[\da-fA-F]{4}$/.test(raw)) {
        output += String.fromCharCode(Number.parseInt(raw, 16));
        index += 6;
        continue;
      }
    }

    if (next === 'x') {
      const raw = input.slice(index + 2, index + 4);
      if (/^[\da-fA-F]{2}$/.test(raw)) {
        output += String.fromCharCode(Number.parseInt(raw, 16));
        index += 4;
        continue;
      }
    }

    output += `\\${next}`;
    index += 2;
  }

  return output;
}

export function escapeText(input: string, mode: EscapeMode) {
  switch (mode) {
    case 'json':
      return JSON.stringify(input).slice(1, -1);
    case 'url':
      return encodeURIComponent(input);
    case 'html':
      return escapeHtml(input);
    case 'unicode':
      return escapeUnicode(input);
  }
}

export function unescapeText(input: string, mode: EscapeMode) {
  try {
    switch (mode) {
      case 'json':
        return JSON.parse(`"${input}"`) as string;
      case 'url':
        return decodeURIComponent(input);
      case 'html':
        return unescapeHtml(input);
      case 'unicode':
        return unescapeUnicode(input);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : '输入格式不正确。';
    const labels: Record<EscapeMode, string> = {
      json: 'JSON',
      url: 'URL',
      html: 'HTML',
      unicode: 'Unicode',
    };
    throw new TextToolError(`${labels[mode]} 反转义失败：${detail}`);
  }
}
