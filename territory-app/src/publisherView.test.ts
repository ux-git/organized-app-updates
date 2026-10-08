import { describe, expect, test } from 'vitest';
import {
  publisherNameParts,
  sortPublishers,
  currentPublisherTerritories,
} from './publisherView';
import { selectionActions } from '@features/territories/components/selection_actions';
import { focusScrollDelta } from './keyboardViewport';
import type { Territory } from '@definition/territory';
const item = (status: Territory['status']) => ({ status }) as Territory;
describe('selection actions across filtered lists', () => {
  test('only applicable action appears', () => {
    expect(selectionActions([item('overdue'), item('in_work')])).toEqual([
      { kind: 'return', count: 2 },
    ]);
    expect(selectionActions([item('available')])).toEqual([
      { kind: 'assign', count: 1 },
    ]);
    expect(selectionActions([])).toEqual([]);
  });
  test('first selection determines action order, each count includes all selections', () => {
    expect(
      selectionActions([
        item('in_work'),
        item('available'),
        item('overdue'),
        item('available'),
      ])
    ).toEqual([
      { kind: 'return', count: 2 },
      { kind: 'assign', count: 2 },
    ]);
    expect(selectionActions([item('available'), item('in_work')])).toEqual([
      { kind: 'assign', count: 1 },
      { kind: 'return', count: 1 },
    ]);
  });
});
describe('publisher views', () => {
  test('sorts without changing saved names or source order', () => {
    const people = [
      { id: '1', name: 'Zoe Adams', group: false },
      { id: '2', name: 'Anna Zimmer', group: false },
    ];
    expect(sortPublishers(people, 'first', 'de').map((p) => p.id)).toEqual([
      '2',
      '1',
    ]);
    expect(sortPublishers(people, 'last', 'de').map((p) => p.id)).toEqual([
      '1',
      '2',
    ]);
    expect(people[0].name).toBe('Zoe Adams');
  });
  test('supports explicit surname and single names', () => {
    expect(publisherNameParts(' van Dijk,  Anna Maria ')).toEqual({
      first: 'Anna Maria',
      last: 'van Dijk',
    });
    expect(publisherNameParts('Alex')).toEqual({ first: 'Alex', last: 'Alex' });
  });
  test('current territories exclude closed and other publishers assignments', () => {
    const territories = [
      { id: '1', assignments: [{ publisher: 'Alex' }] },
      {
        id: '2',
        assignments: [{ publisher: 'Alex', returnedOn: '01.01.2026' }],
      },
      { id: '3', assignments: [{ publisher: 'Anna' }] },
    ] as Territory[];
    expect(
      currentPublisherTerritories(territories, 'Alex').map((t) => t.id)
    ).toEqual(['1']);
  });
});
describe('keyboard focus visibility', () => {
  test('scrolls only enough to expose a covered field', () => {
    expect(focusScrollDelta(420, 460, 60, 400)).toBe(60);
    expect(focusScrollDelta(30, 70, 60, 400)).toBe(-30);
    expect(focusScrollDelta(100, 140, 60, 400)).toBe(0);
  });
  test('aligns tall fields at the top and ignores collapsed scroll areas', () => {
    expect(focusScrollDelta(100, 500, 60, 300)).toBe(40);
    expect(focusScrollDelta(100, 140, 400, 300)).toBe(0);
  });
});
