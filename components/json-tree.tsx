'use client';

import type { JsonValue } from '@/lib/text-tools';

interface JsonTreeProps {
  value: JsonValue;
  expandedPaths: ReadonlySet<string>;
  onToggle: (path: string) => void;
}

interface JsonTreeNodeProps extends JsonTreeProps {
  path: string;
  label?: string;
  arrayItem?: boolean;
}

function isContainer(value: JsonValue): value is JsonValue[] | { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object';
}

function escapePathPart(part: string) {
  return part.replaceAll('~', '~0').replaceAll('/', '~1');
}

function childPath(parent: string, part: string) {
  return `${parent}/${escapePathPart(part)}`;
}

function entriesOf(value: JsonValue[] | { [key: string]: JsonValue }) {
  return Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);
}

function containerLabel(value: JsonValue[] | { [key: string]: JsonValue }) {
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  return `${count.toLocaleString('zh-CN')} 个${Array.isArray(value) ? '元素' : '字段'}`;
}

function PrimitiveValue({ value }: { value: Exclude<JsonValue, JsonValue[] | { [key: string]: JsonValue }> }) {
  if (value === null) {
    return <span className="json-tree-value json-tree-null" title="空值">null</span>;
  }

  if (typeof value === 'string') {
    return <span className="json-tree-value json-tree-string">{JSON.stringify(value)}</span>;
  }

  if (typeof value === 'number') {
    return <span className="json-tree-value json-tree-number">{String(value)}</span>;
  }

  return <span className="json-tree-value json-tree-boolean">{String(value)}</span>;
}

function NodeLabel({ label, arrayItem }: { label?: string; arrayItem?: boolean }) {
  if (label === undefined) return null;

  return (
    <>
      <span className="json-tree-key">{arrayItem ? `[${label}]` : JSON.stringify(label)}</span>
      <span className="json-tree-punctuation" aria-hidden="true">: </span>
    </>
  );
}

function JsonTreeNode({ value, path, label, arrayItem, expandedPaths, onToggle }: JsonTreeNodeProps) {
  if (!isContainer(value)) {
    return (
      <li className="json-tree-item json-tree-leaf">
        <div className="json-tree-row">
          <span className="json-tree-toggle-placeholder" aria-hidden="true" />
          <NodeLabel label={label} arrayItem={arrayItem} />
          <PrimitiveValue value={value} />
        </div>
      </li>
    );
  }

  const expanded = expandedPaths.has(path);
  const entries = entriesOf(value);
  const opening = Array.isArray(value) ? '[' : '{';
  const closing = Array.isArray(value) ? ']' : '}';
  const nodeName = label === undefined
    ? '根节点'
    : arrayItem
      ? `第 ${Number(label) + 1} 个元素`
      : `字段 ${label}`;

  return (
    <li className="json-tree-item json-tree-branch">
      <div className="json-tree-row">
        <button
          className="json-tree-toggle"
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? '收起' : '展开'}${nodeName}，${containerLabel(value)}`}
          onClick={() => onToggle(path)}
        >
          <span className="json-tree-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        </button>
        <NodeLabel label={label} arrayItem={arrayItem} />
        <span className="json-tree-punctuation" aria-hidden="true">{opening}</span>
        {!expanded ? (
          <>
            <span className="json-tree-count">… · {containerLabel(value)}</span>
            <span className="json-tree-punctuation" aria-hidden="true">{closing}</span>
          </>
        ) : null}
      </div>

      {expanded ? (
        <>
          {entries.length > 0 ? (
            <ul className="json-tree-list json-tree-children">
              {entries.map(([entryLabel, child]) => (
                <JsonTreeNode
                  key={childPath(path, entryLabel)}
                  value={child}
                  path={childPath(path, entryLabel)}
                  label={entryLabel}
                  arrayItem={Array.isArray(value)}
                  expandedPaths={expandedPaths}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          ) : (
            <div className="json-tree-empty">空</div>
          )}
          <div className="json-tree-row json-tree-closing-row">
            <span className="json-tree-toggle-placeholder" aria-hidden="true" />
            <span className="json-tree-punctuation" aria-hidden="true">{closing}</span>
          </div>
        </>
      ) : null}
    </li>
  );
}

export function collectJsonContainerPaths(value: JsonValue) {
  const paths: string[] = [];

  const visit = (current: JsonValue, path: string) => {
    if (!isContainer(current)) return;
    paths.push(path);
    entriesOf(current).forEach(([label, child]) => visit(child, childPath(path, label)));
  };

  visit(value, '$');
  return paths;
}

export function getDefaultJsonExpandedPaths(value: JsonValue) {
  const paths = new Set<string>();

  const visit = (current: JsonValue, path: string, depth: number) => {
    if (!isContainer(current)) return;
    if (depth <= 1) paths.add(path);
    if (depth >= 1) return;
    entriesOf(current).forEach(([label, child]) => visit(child, childPath(path, label), depth + 1));
  };

  visit(value, '$', 0);
  return paths;
}

export function JsonTree({ value, expandedPaths, onToggle }: JsonTreeProps) {
  return (
    <div className="json-tree" aria-label="可展开的 JSON 结构">
      <ul className="json-tree-list json-tree-root">
        <JsonTreeNode
          value={value}
          path="$"
          expandedPaths={expandedPaths}
          onToggle={onToggle}
        />
      </ul>
    </div>
  );
}
