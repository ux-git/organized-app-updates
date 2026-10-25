import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Territory } from '@definition/territory';
import type { TerritoryAccessContext } from '@definition/territory_access';
import { forTab, territoryTabGroups } from '@features/territories/tabs';

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

const publisherContext: TerritoryAccessContext = {
  editor: false,
  publisher: 'Anna',
  eligiblePublisher: true,
  access: 'request',
  restricted: { categories: [], types: [] },
};

test('pending requests stay reachable after requesting is disabled', () => {
  for (const access of ['own', 'view'] as const) {
    const context = { ...publisherContext, access, eligiblePublisher: false };
    assert.ok(
      territoryTabGroups(context, false, true).flat().includes('requested')
    );
    assert.ok(
      !territoryTabGroups(context, false, false).flat().includes('requested')
    );
  }
});

test('navigation separates publishers, group overseers, and administrators', () => {
  assert.deepEqual(territoryTabGroups(publisherContext, false, false), [
    ['recommended', 'all'],
    ['mine', 'requested'],
  ]);
  assert.deepEqual(
    territoryTabGroups(
      { ...publisherContext, access: 'own', groupHolder: 'Group 1' },
      false,
      false
    ),
    [['mine', 'group']]
  );
  assert.ok(
    territoryTabGroups({ ...publisherContext, editor: true }, false, false)
      .flat()
      .includes('requests')
  );
  assert.ok(
    !territoryTabGroups({ ...publisherContext, editor: true }, true, false)
      .flat()
      .includes('requests')
  );
  assert.ok(
    !territoryTabGroups({ ...publisherContext, publisher: '' }, false, true)
      .flat()
      .includes('requested')
  );
});
