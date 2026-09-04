import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diffJson,
  escapeText,
  formatJson,
  minifyJson,
  readJson,
  unescapeText,
  type EscapeMode,
} from '../lib/text-tools.ts';

test('JSON 格式化、压缩与结构统计保持同一语义', () => {
  const source = '{"user":{"name":"ZY5","tags":["local",true,null]}}';
  const document = readJson(source);

  assert.deepEqual(JSON.parse(document.formatted), JSON.parse(source));
  assert.equal(minifyJson(document.formatted), source);
  assert.match(formatJson(source), /\n  "user"/);
  assert.deepEqual(document.stats, {
    objectCount: 2,
    arrayCount: 1,
    keyCount: 3,
    primitiveCount: 4,
    totalNodes: 7,
    maxDepth: 4,
  });
});

test('JSON Diff 忽略对象字段顺序并递归定位真实差异', () => {
  const reordered = diffJson('{"a":1,"b":{"ok":true}}', '{"b":{"ok":true},"a":1}');
  assert.equal(reordered.identical, true);

  const changed = diffJson(
    '{"name":"old","items":[1,2],"gone":true}',
    '{"name":"new","items":[1,2,3],"ready":true}',
  );
  assert.deepEqual(
    changed.entries.map(({ path, type }) => ({ path, type })),
    [
      { path: '$.gone', type: 'removed' },
      { path: '$.items[2]', type: 'added' },
      { path: '$.name', type: 'changed' },
      { path: '$.ready', type: 'added' },
    ],
  );
  assert.equal(changed.added, 2);
  assert.equal(changed.removed, 1);
  assert.equal(changed.changed, 1);
});

test('四种文本模式均可往返转换', () => {
  const source = '你好 <a href="/?q=1&x=2">😀</a>\\n\n';
  const modes: EscapeMode[] = ['json', 'url', 'html', 'unicode'];

  modes.forEach((mode) => {
    assert.equal(unescapeText(escapeText(source, mode), mode), source, mode);
  });

  assert.equal(unescapeText('&#20320;&#x597D;', 'html'), '你好');
  assert.equal(unescapeText('\\u{1F600}', 'unicode'), '😀');
});

test('非法 JSON 与 URL 编码给出可读错误', () => {
  assert.throws(() => formatJson('{"a":}'), /JSON解析失败/);
  assert.throws(() => unescapeText('%E0%A4%A', 'url'), /URL 反转义失败/);
});
