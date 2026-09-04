import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diffCharacters,
  diffLines,
  formatUnifiedLineDiff,
  LineDiffError,
} from '../lib/line-diff.ts';

test('LCS 将插入行与两侧原文正确对齐', () => {
  const result = diffLines('第一行\n第二行\n第三行', '第一行\n新增行\n第二行\n第三行');

  assert.deepEqual(result.rows.map((row) => row.kind), ['same', 'added', 'same', 'same']);
  assert.equal(result.rows[1].left, null);
  assert.equal(result.rows[1].right?.lineNumber, 2);
  assert.equal(result.rows[2].left?.lineNumber, 2);
  assert.equal(result.rows[2].right?.lineNumber, 3);
  assert.deepEqual(
    { added: result.added, removed: result.removed, changed: result.changed },
    { added: 1, removed: 0, changed: 0 },
  );
});

test('相邻删除与新增配成修改行，并进一步标记字符差异', () => {
  const result = diffLines('  "version": 1,', '  "version": 2,');
  const row = result.rows[0];

  assert.equal(row.kind, 'changed');
  assert.equal(row.left?.segments.filter((segment) => segment.changed).map((segment) => segment.text).join(''), '1');
  assert.equal(row.right?.segments.filter((segment) => segment.changed).map((segment) => segment.text).join(''), '2');
  assert.equal(row.left?.segments.filter((segment) => !segment.changed).map((segment) => segment.text).join(''), '  "version": ,');
  assert.match(formatUnifiedLineDiff(result), /^- .*1,\n\+ .*2,$/);
});

test('字符比较按 Unicode 字符处理，不拆开表情符号', () => {
  const result = diffCharacters('状态：🙂', '状态：🚀');

  assert.equal(result.left.filter((segment) => segment.changed).map((segment) => segment.text).join(''), '🙂');
  assert.equal(result.right.filter((segment) => segment.changed).map((segment) => segment.text).join(''), '🚀');
});

test('统一换行符并正确保留删除行', () => {
  const result = diffLines('甲\r\n乙\r\n丙', '甲\n丙');

  assert.deepEqual(result.rows.map((row) => row.kind), ['same', 'removed', 'same']);
  assert.equal(result.rows[1].left?.text, '乙');
  assert.equal(result.rows[1].left?.lineNumber, 2);
  assert.equal(result.rows[2].right?.lineNumber, 2);
});

test('输入规模超过限制时拒绝执行高成本 LCS', () => {
  assert.throws(
    () => diffLines('一\n二\n三', '一\n二', { maxLinesPerSide: 2 }),
    (error) => error instanceof LineDiffError && /每侧最多比较 2 行/.test(error.message),
  );

  assert.throws(
    () => diffLines('甲\n乙\n丙', '丁\n戊\n己', { maxLcsCells: 8 }),
    (error) => error instanceof LineDiffError && /差异范围过大/.test(error.message),
  );

  assert.throws(
    () => diffLines('12345', '123', { maxCharactersPerSide: 4 }),
    (error) => error instanceof LineDiffError && /最多比较 4 个字符/.test(error.message),
  );
});
