import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseTerritoryHouseholds,
  territoryReturnDateError,
} from '../src/utils/territory_assignments';

const today = new Date(2026, 9, 25);
const assignments = [{ assignedOn: '20.10.2026' }];

test('zero households is a real count; blank preserves the previous count', () => {
  assert.equal(parseTerritoryHouseholds('0', 25), 0);
  assert.equal(parseTerritoryHouseholds(' ', 25), 25);
  assert.equal(parseTerritoryHouseholds(' 42 ', 25), 42);
});

test('negative, fractional, infinite, and unsafe household counts are rejected', () => {
  for (const value of [
    '-1',
    '1.5',
    'Infinity',
    '1e4',
    '0x10',
    '9007199254740992',
  ]) {
    assert.equal(parseTerritoryHouseholds(value, 25), undefined, value);
  }
});

test('a return on the assignment day or today is valid', () => {
  assert.equal(
    territoryReturnDateError(assignments, new Date(2026, 9, 20), today),
    undefined
  );
  assert.equal(
    territoryReturnDateError(assignments, new Date(2026, 9, 25, 23, 59), today),
    undefined
  );
});

test('a future, missing, or invalid return date cannot be saved', () => {
  assert.equal(
    territoryReturnDateError(assignments, new Date(2026, 9, 26), today),
    'tr_territoryDateFuture'
  );
  assert.equal(
    territoryReturnDateError(assignments, null, today),
    'tr_territoryDateRequired'
  );
  assert.equal(
    territoryReturnDateError(assignments, new Date('invalid'), today),
    'tr_territoryDateRequired'
  );
});

test('all open assignments must start no later than the return date', () => {
  assert.equal(
    territoryReturnDateError(
      [...assignments, { assignedOn: '24.10.2026' }],
      new Date(2026, 9, 22),
      today
    ),
    'tr_territoryReturnBeforeAssigned'
  );
});

test('impossible stored calendar dates require correction, not silent rollover', () => {
  assert.equal(
    territoryReturnDateError([{ assignedOn: '31.02.2026' }], today, today),
    'tr_territoryAssignmentDateInvalid'
  );
});

test('completed historical assignments do not prevent returning the current one', () => {
  assert.equal(
    territoryReturnDateError(
      [...assignments, { assignedOn: 'legacy', returnedOn: '01.10.2026' }],
      today,
      today
    ),
    undefined
  );
});
