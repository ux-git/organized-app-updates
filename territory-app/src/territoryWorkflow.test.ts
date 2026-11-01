import { describe, expect, test } from 'vitest';
import type { Territory, TerritoryAssignment } from '@definition/territory';
import {
  changedTerritories,
  keepOneAssignment,
  revertedTerritories,
} from './publisherChanges';
import { s13Rows } from '@features/territories/history/s13_rows';
import { forTab, pastCooldown } from '@features/territories/tabs';
import {
  applyFilters,
  EMPTY_FILTERS,
  withAssignments,
} from '@features/territories/helpers';
import { isCoverage } from '@features/territories/coverage_rate';
import { tileUrls } from '@services/maps/tiles';
const assignment = (
  data: Partial<TerritoryAssignment> = {}
): TerritoryAssignment => ({
  id: 'a',
  publisher: 'Alex',
  assignedOn: '01.01.2026',
  serviceYear: 2026,
  months: 1,
  startMonth: 4,
  endMonth: 4,
  ...data,
});
const territory = (
  assignments: TerritoryAssignment[] = [],
  data: Partial<Territory> = {}
): Territory => ({
  id: 't',
  number: '1',
  name: 'Test',
  city: 'Test city',
  type: 'door_to_door',
  status: 'available',
  categories: [],
  daysSinceCovered: 100,
  households: 20,
  cardLost: false,
  doNotCalls: [],
  assignments,
  ...data,
});
const person = { id: 'p', name: 'Alex', group: false };
const now = new Date(2026, 9, 3, 12);
describe('publisher history', () => {
  test('requires a decision for active assignments', () =>
    expect(() =>
      changedTerritories(
        [territory([assignment()])],
        person,
        { resolutions: {} },
        now
      )
    ).toThrow('every active'));
  test('returns a territory without deleting old history', () => {
    const historical = assignment({ id: 'old', returnedOn: '01.02.2026' });
    const [result] = changedTerritories(
      [territory([historical, assignment()])],
      person,
      { resolutions: { t: {} } },
      now
    );
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments[0]).toEqual(historical);
    expect(result.assignments[1]).toMatchObject({
      publisher: 'Alex',
      returnedOn: '03.10.2026',
    });
    expect(result.assignments[1].completed).toBeUndefined();
    expect(result.holder).toBeUndefined();
  });
  test('transfer changes only the active publisher and preserves completed history', () => {
    const historical = assignment({ id: 'old', returnedOn: '01.02.2026' });
    const source = assignment({
      campaign: { id: 'c', name: 'Campaign' },
      card: 'printed',
      note: 'Keep this note',
    });
    const [result] = changedTerritories(
      [territory([historical, source])],
      person,
      { resolutions: { t: { target: 'Ben' } } },
      now
    );
    expect(result.assignments).toEqual([
      historical,
      { ...source, publisher: 'Ben' },
    ]);
    expect(result.holder).toBe('Ben');
    expect(source.publisher).toBe('Alex');
  });
  test('transfer cannot conceal another publisher’s open assignment', () => {
    expect(() =>
      changedTerritories(
        [
          territory([
            assignment(),
            assignment({ id: 'other', publisher: 'Chris' }),
          ]),
        ],
        person,
        { resolutions: { t: { target: 'Ben' } } },
        now
      )
    ).toThrow('other open assignment');
  });
  test('merge retains every assignment ID and date', () => {
    const source = territory([
      assignment(),
      assignment({ id: 'b', publisher: 'Ben', returnedOn: '02.02.2026' }),
    ]);
    const [result] = changedTerritories(
      [source],
      person,
      { mergeInto: { id: 'b', name: 'Ben', group: false }, resolutions: {} },
      now
    );
    expect(result.assignments.map((a) => a.id)).toEqual(['a', 'b']);
    expect(result.assignments.map((a) => a.publisher)).toEqual(['Ben', 'Ben']);
    expect(source.assignments[0].publisher).toBe('Alex');
  });
  test('undoing a removal brings back what it changed, and keeps edits made since', () => {
    const before = [
      territory(
        [
          assignment({ id: 'old', returnedOn: '01.02.2026' }),
          assignment({ id: 'open', assignedOn: '01.09.2026' }),
        ],
        { status: 'in_work', holder: 'Alex', requestedBy: 'Alex' }
      ),
      territory([], { id: 'u', number: '2' }),
    ];
    const after = changedTerritories(
      before,
      person,
      { mergeInto: { id: 'b', name: 'Ben', group: false }, resolutions: {} },
      now
    );
    const edited = [{ ...after[0], notes: 'Gate code' }, after[1]];
    const [result, untouched] = revertedTerritories(edited, before, after);
    expect(result.assignments).toEqual(before[0].assignments);
    expect(result.holder).toBe('Alex');
    expect(result.requestedBy).toBe('Alex');
    expect(result.notes).toBe('Gate code');
    expect(untouched).toBe(after[1]);
  });
  test('does not return future assignments before their start', () =>
    expect(() =>
      changedTerritories(
        [territory([assignment({ assignedOn: '04.10.2026' })])],
        person,
        { resolutions: { t: {} } },
        now
      )
    ).toThrow('future'));
  test('given out twice, keeping one returns the other on its start day', () => {
    const older = assignment({ id: 'old', assignedOn: '01.03.2026' });
    const kept = assignment({
      id: 'new',
      publisher: 'Ben',
      assignedOn: '15.04.2026',
    });
    const result = keepOneAssignment(territory([older, kept]), 'new');
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments[0]).toMatchObject({
      id: 'old',
      publisher: 'Alex',
      returnedOn: '15.04.2026',
    });
    expect(result.assignments[1]).toEqual(kept);
    expect(result.holder).toBe('Ben');
    const back = keepOneAssignment(territory([older, kept]), 'old');
    expect(back.assignments[1]).toMatchObject({
      id: 'new',
      returnedOn: '15.04.2026',
    });
    expect(back.holder).toBe('Alex');
  });
});
describe('S-13 and coverage', () => {
  test('includes campaign records with or without the optional localized marker', () => {
    const source = territory([
      assignment({
        campaign: { id: 'c', name: 'C', coverage: false },
        returnedOn: '02.02.2026',
      }),
    ]);
    expect(
      s13Rows(source, 'dd.MM.yyyy', 'A', now)[0].entries[0].assignedOn
    ).toBe('01.01.2026 (A)');
    expect(s13Rows(source, 'dd.MM.yyyy', '', now)[0].entries).toHaveLength(1);
    expect(
      s13Rows(source, 'dd.MM.yyyy', 'C', now)[0].entries[0].assignedOn
    ).toContain('(C)');
    expect(isCoverage(source.assignments[0])).toBe(false);
  });
  test('includes old history, paginates four entries per row and excludes future records', () => {
    const source = territory(
      Array.from({ length: 6 }, (_, i) =>
        assignment({ id: String(i), assignedOn: `0${i + 1}.01.2020` })
      ).concat(assignment({ assignedOn: '04.10.2026' }))
    );
    const rows = s13Rows(source, 'dd.MM.yyyy', '', now);
    expect(rows.map((row) => row.entries.length)).toEqual([4, 2]);
    expect(rows.every((row) => row.number === '1')).toBe(true);
  });
  test('unfinished returns remain in history but do not count as regular coverage', () => {
    const source = territory([
      assignment({ returnedOn: '02.02.2026', completed: false }),
    ]);
    const [row] = s13Rows(source, 'dd.MM.yyyy', '', now);
    expect(row.entries[0].completedOn).toBeUndefined();
    expect(row.lastCompleted).toBeUndefined();
    expect(isCoverage(source.assignments[0])).toBe(false);
  });
  test('the S-13 prints the publisher, never the group', () => {
    const source = territory([
      assignment({ publisher: 'Max Müller', group: 'Group 3' }),
      assignment({ id: 'old', publisher: '', group: 'Group 2' }),
    ]);
    const names = s13Rows(source, 'dd.MM.yyyy', '', now)[0].entries.map(
      (entry) => entry.publisher
    );
    expect(names).toEqual(['Max Müller', '']);
  });
});
describe('group assignments', () => {
  const forGroup = territory(
    [assignment({ publisher: 'Max', group: 'Group 3' })],
    { status: 'in_work' }
  );
  const group = { id: 'g3', name: 'Group 3', group: true };
  test('the holder is the publisher, the group beside it', () => {
    const held = withAssignments(forGroup, forGroup.assignments);
    expect(held.holder).toBe('Max');
    expect(held.holderGroup).toBe('Group 3');
    expect(forTab([held], 'mine', 'Max')).toEqual([held]);
    expect(forTab([held], 'group', '', true, 'Group 3')).toEqual([held]);
    expect(
      applyFilters([held, territory()], { ...EMPTY_FILTERS, forGroups: true })
    ).toEqual([held]);
  });
  test('a group handed to another group keeps who took it', () => {
    const [result] = changedTerritories(
      [forGroup],
      group,
      { resolutions: { t: { target: 'Group 4' } } },
      now
    );
    expect(result.assignments[0]).toMatchObject({
      publisher: 'Max',
      group: 'Group 4',
    });
    expect(result.holderGroup).toBe('Group 4');
  });
  test('a merged group is renamed on its assignments only', () => {
    const [result] = changedTerritories(
      [forGroup],
      group,
      {
        mergeInto: { id: 'g4', name: 'Group 4', group: true },
        resolutions: {},
      },
      now
    );
    expect(result.assignments[0]).toMatchObject({
      publisher: 'Max',
      group: 'Group 4',
    });
  });
});
describe('recommendations', () => {
  test('uses calendar months with the latest return', () => {
    const source = territory([assignment({ returnedOn: '31.01.2026' })]);
    expect(pastCooldown(source, 1, new Date(2026, 1, 27))).toBe(false);
    expect(pastCooldown(source, 1, new Date(2026, 1, 28))).toBe(true);
    expect(pastCooldown(territory(), 12, now)).toBe(true);
  });
  test('exclusions only affect recommendations', () => {
    const items = [territory([], { categories: ['excluded'] })];
    const preferences = {
      cooldownMonths: 0,
      categories: ['excluded'],
      types: [],
    };
    expect(
      forTab(items, 'recommended', '', true, undefined, undefined, { recommendations: preferences })
    ).toEqual([]);
    expect(
      forTab(items, 'all', '', true, undefined, undefined, { recommendations: preferences })
    ).toEqual(items);
  });
});
describe('offline tile bounds', () => {
  test('includes low zooms and caps source detail at 14', () => {
    const urls = tileUrls(
      'https://tiles/{z}/{x}/{y}.pbf',
      [6.3, 51.5, 6.31, 51.51],
      0,
      16
    );
    expect(urls).toContain('https://tiles/0/0/0.pbf');
    expect(urls.some((url) => new URL(url).pathname.startsWith('/14/'))).toBe(
      true
    );
    expect(urls.some((url) => new URL(url).pathname.startsWith('/15/'))).toBe(
      false
    );
    expect(new Set(urls).size).toBe(urls.length);
  });
  test('rejects excessive or invalid regions before downloading', () => {
    expect(() => tileUrls('{z}/{x}/{y}', [-180, -85, 180, 85])).toThrow(
      'too large'
    );
    expect(() => tileUrls('{z}/{x}/{y}', [6, 50, 5, 51])).toThrow('Invalid');
  });
});

describe('publisher change undo conflicts', () => {
  test('does not replace a note edited after a merge', () => {
    const before = [
      territory([assignment()], { status: 'in_work', holder: 'Alex' }),
    ];
    const after = changedTerritories(
      before,
      person,
      {
        mergeInto: { id: 'b', name: 'Ben', group: false },
        resolutions: {},
      },
      now
    );
    const edited = [
      {
        ...after[0],
        assignments: after[0].assignments.map((item) => ({
          ...item,
          note: 'New note',
        })),
      },
    ];
    expect(revertedTerritories(edited, before, after)[0]).toBe(edited[0]);
  });
  test('does not undo a newer holder when undoing a publisher merge', () => {
    const before = [
      territory([assignment()], { status: 'in_work', holder: 'Alex' }),
    ];
    const after = changedTerritories(
      before,
      person,
      {
        mergeInto: { id: 'b', name: 'Ben', group: false },
        resolutions: {},
      },
      now
    );
    const edited = [{ ...after[0], holder: 'Cleo' }];
    expect(revertedTerritories(edited, before, after)[0]).toBe(edited[0]);
  });
});
