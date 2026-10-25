import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Territory } from '@definition/territory';
import { forTab } from '@features/territories/tabs';

const territory = (number: string, holder?: string, requestedBy?: string) =>
  ({
    id: number,
    number,
    status: holder ? 'in_work' : 'available',
    holder,
    requestedBy,
  }) as Territory;

const territories = [
  territory('1', 'Anna Weber'),
  territory('2', 'Ben Beispiel'),
  territory('3', 'Anna Weber'),
  territory('4', undefined, 'Ben Beispiel'),
];

const numbers = (list: Territory[]) => list.map((item) => item.number);

test('mine follows the current publisher', () => {
  assert.deepEqual(numbers(forTab(territories, 'mine', 'Anna Weber')), [
    '1',
    '3',
  ]);
  assert.deepEqual(numbers(forTab(territories, 'mine', 'Ben Beispiel')), ['2']);
});

test('requested follows the current publisher', () => {
  assert.deepEqual(numbers(forTab(territories, 'requested', 'Ben Beispiel')), [
    '4',
  ]);
  assert.deepEqual(numbers(forTab(territories, 'requested', 'Anna Weber')), []);
});

test('without a publisher, nothing is mine', () => {
  assert.deepEqual(numbers(forTab(territories, 'mine', '')), []);
});
