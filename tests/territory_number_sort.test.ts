import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareTerritoryNumbers,
  suggestSplitTerritoryNumber,
} from '../src/utils/territory';

test('splitting M22 suggests M22A without moving M23 or using the end of the list', () => {
  assert.equal(
    suggestSplitTerritoryNumber('M22', ['M22', 'M23', 'M42']),
    'M22A'
  );
  assert.equal(
    suggestSplitTerritoryNumber('M22A', ['M22', 'M22A', 'M23']),
    'M22B'
  );
});

test('nearby numbering handles case, whitespace, padded numbers, and suffix exhaustion', () => {
  assert.equal(
    suggestSplitTerritoryNumber(' M022 ', ['m022a ', 'Ｍ０２２Ｂ']),
    'M022C'
  );
  const taken = Array.from(
    { length: 26 },
    (_, i) => `M22${String.fromCharCode(65 + i)}`
  );
  assert.equal(suggestSplitTerritoryNumber('M22', taken), 'M22AA');
  assert.equal(suggestSplitTerritoryNumber('', []), '');
});

test('territory numbers sort naturally with nearby suffixes', () => {
  const numbers = ['M23', 'M22B', 'M2', 'M22', 'M10', 'M22A'];
  assert.deepEqual(numbers.sort(compareTerritoryNumbers), [
    'M2',
    'M10',
    'M22',
    'M22A',
    'M22B',
    'M23',
  ]);
});

test('the shared comparator preserves the existing localeCompare ordering', () => {
  const numbers = [
    '1',
    '12',
    '2',
    'M02',
    'M2',
    'M22A',
    'm22a',
    'M22-1',
    'N1',
    'Ä3',
    'M22AA',
  ];
  const original = [...numbers].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  assert.deepEqual([...numbers].sort(compareTerritoryNumbers), original);
});
