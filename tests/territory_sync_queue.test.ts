import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coalesceTerritoryChanges } from '../src/utils/territory_sync_queue';
import type { TerritoryPendingOperation } from '../src/definition/territory_sync';
import type { Territory } from '../src/definition/territory';
const original = { id: 'a', name: 'Original' } as Territory;
const change = (name: string) => ({
  id: 'main:a',
  dataView: 'main',
  before: original,
  after: { ...original, name },
  baseRevision: 3,
});
test('correcting an unsent migration preserves its original revision and replaces the draft', () => {
  const queue: TerritoryPendingOperation[] = [
    { id: 'one', changes: [change('Old')] },
  ];
  assert.equal(coalesceTerritoryChanges(queue, [change('Corrected')]), true);
  assert.equal(queue[0].changes[0].after?.name, 'Corrected');
  assert.equal(queue[0].changes[0].baseRevision, 3);
});
test('a prepared payload is immutable, even after a lost response', () => {
  const queue: TerritoryPendingOperation[] = [
    {
      id: 'one',
      changes: [change('Old')],
      prepared: { operationId: 'one', expectedRevision: 3, commands: [] },
    },
  ];
  assert.equal(coalesceTerritoryChanges(queue, [change('New')]), false);
  assert.equal(queue[0].changes[0].after?.name, 'Old');
});
test('undoing an unsent edit removes its queued change', () => {
  const queue: TerritoryPendingOperation[] = [
    { id: 'one', changes: [change('Old')] },
  ];
  assert.equal(coalesceTerritoryChanges(queue, [change('Original')]), true);
  assert.equal(queue[0].changes.length, 0);
});
