import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Territory } from '@definition/territory';
import { coverageRate } from '../coverage_rate';

const territory = (
  id: string,
  assignments: { assignedOn: string; returnedOn?: string }[]
) =>
  ({
    id,
    assignments: assignments.map((dates, index) => ({
      id: `${id}-${index}`,
      publisher: 'Anna Weber',
      serviceYear: 2026,
      months: 1,
      startMonth: 0,
      endMonth: 0,
      ...dates,
    })),
  }) as Territory;

const year2026 = {
  start: new Date(2025, 8, 1),
  end: new Date(2026, 7, 31, 23, 59, 59),
};

test('counts the territories returned in the period, out of all', () => {
  const territories = [
    territory('a', [{ assignedOn: '01.10.2025', returnedOn: '15.12.2025' }]),
    territory('b', [
      { assignedOn: '01.10.2025', returnedOn: '15.11.2025' },
      { assignedOn: '01.01.2026', returnedOn: '15.03.2026' },
    ]),
    territory('c', [{ assignedOn: '01.03.2026' }]),
    territory('d', []),
  ];

  assert.deepEqual(coverageRate(territories, year2026), {
    rate: 50,
    covered: 2,
    total: 4,
  });
});

test('the first and the last day of the period both count', () => {
  const territories = [
    territory('a', [{ assignedOn: '01.08.2025', returnedOn: '01.09.2025' }]),
    territory('b', [{ assignedOn: '01.08.2026', returnedOn: '31.08.2026' }]),
    territory('c', [{ assignedOn: '01.08.2025', returnedOn: '31.08.2025' }]),
  ];

  assert.deepEqual(coverageRate(territories, year2026), {
    rate: 67,
    covered: 2,
    total: 3,
  });
});

test('no territories is nothing covered, not a division by zero', () => {
  assert.deepEqual(coverageRate([], year2026), {
    rate: 0,
    covered: 0,
    total: 0,
  });
});
