import assert from 'node:assert/strict';
import test from 'node:test';
import { filterToolCategories, toolCategories, tools } from '../lib/tool-catalog.ts';

test('首页与导航分类覆盖全部工具，没有重复或遗漏', () => {
  assert.deepEqual(toolCategories.map(({ name, tools }) => [name, tools.map(({ id }) => id)]), [
    ['开发工具', ['base64', 'timestamp', 'json-viewer', 'json-diff', 'escape']],
    ['计算工具', ['compound']],
    ['行情', ['crypto-market', 'ahr999', 'us-market']],
  ]);
  const groupedIds = toolCategories.flatMap(({ tools }) => tools.map(({ id }) => id));
  assert.equal(new Set(groupedIds).size, tools.length);
  assert.deepEqual(groupedIds.toSorted(), tools.map(({ id }) => id).toSorted());
});

test('空白搜索保留全部分类，分类名称可以直接搜索', () => {
  assert.deepEqual(filterToolCategories('  '), toolCategories);
  for (const category of toolCategories) {
    assert.deepEqual(filterToolCategories(category.name), [category]);
  }
});

test('工具搜索忽略首尾空格与英文大小写，只保留匹配分类', () => {
  const matches = filterToolCategories('  jSoN  ');
  assert.deepEqual(matches.map(({ id }) => id), ['development']);
  assert.deepEqual(matches[0].tools.map(({ id }) => id), ['json-viewer', 'json-diff', 'escape']);
});

test('币种、股票别名与原有分组关键词仍能查到工具', () => {
  for (const [query, expected] of [
    ['bnbusdt', 'crypto-market'], ['APPL', 'us-market'], ['酒神', 'ahr999'],
    ['财务计算', 'compound'], ['时间日期', 'timestamp'],
  ]) {
    assert.deepEqual(filterToolCategories(query).flatMap(({ tools }) => tools.map(({ id }) => id)), [expected]);
  }
});

test('没有匹配时不留下空分类，搜索不会改变导航目录', () => {
  assert.deepEqual(filterToolCategories('不存在的工具_xyz'), []);
  filterToolCategories('复利');
  assert.deepEqual(filterToolCategories(''), toolCategories);
  assert.equal(toolCategories.flatMap(({ tools }) => tools).length, 9);
});
