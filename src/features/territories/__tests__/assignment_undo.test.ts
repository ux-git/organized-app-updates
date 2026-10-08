import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Territory } from '@definition/territory';
import { revertAssignment } from '../assignment_undo';

const base = {
  serviceYear: 2026,
  months: 1,
  startMonth: 0,
  endMonth: 0,
};

const before: Territory = {
  id: 't1',
  number: '1',
  name: 'North',
  city: 'Town',
  type: 'door_to_door',
  status: 'in_work',
  holder: 'Anna',
  daysOut: 10,
  categories: [],
  cardLost: false,
  daysSinceCovered: 200,
  households: 40,
  doNotCalls: [],
  assignments: [
    {
      ...base,
      id: 'a0',
      publisher: 'Ben',
      assignedOn: '01.01.2026',
      returnedOn: '01.02.2026',
    },
    { ...base, id: 'a1', publisher: 'Anna', assignedOn: '01.09.2026' },
  ],
};

// returned and assigned again, then a do-not-call and an old note added before the undo
const after: Territory = {
  ...before,
  status: 'in_work',
  holder: 'Anna',
  daysOut: 0,
  daysSinceCovered: 0,
  households: 38,
  reviewNeeded: false,
  notes: 'Gate code 12',
  doNotCalls: [
    { id: 'd1', address: 'Main St 1', date: '05.10.2026', addedBy: 'Anna' },
  ],
  assignments: [
    { ...before.assignments[0], note: 'Dog' },
    { ...before.assignments[1], returnedOn: '05.10.2026' },
    { ...base, id: 'a2', publisher: 'Anna', assignedOn: '05.10.2026' },
  ],
};

test('undo puts the assignment back and keeps edits made meanwhile', () => {
  const result = revertAssignment(after, before, ['a2']);

  assert.deepEqual(result.assignments, [
    { ...before.assignments[0], note: 'Dog' },
    before.assignments[1],
  ]);
  assert.equal(result.daysOut, 10);
  assert.equal(result.daysSinceCovered, 200);
  assert.equal(result.households, 40);
  assert.equal(result.reviewNeeded, undefined);
  assert.equal(result.notes, 'Gate code 12');
  assert.equal(result.doNotCalls.length, 1);
});

test('an assignment added by hand meanwhile stays', () => {
  const extra = {
    ...base,
    id: 'x',
    publisher: 'Cleo',
    assignedOn: '01.05.2025',
    returnedOn: '01.06.2025',
  };
  const result = revertAssignment(
    { ...after, assignments: [...after.assignments, extra] },
    before,
    ['a2']
  );

  assert.deepEqual(result.assignments.at(-1), extra);
});
