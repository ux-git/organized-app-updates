import { describe, expect, test, vi } from 'vitest';
import type { Territory, TerritoryAssignment } from '@definition/territory';
import {
  changedTerritories,
  keepOneAssignment,
  revertedTerritories,
} from './publisherChanges';
import { s13Rows } from '@features/territories/history/s13_rows';
import { forTab, pastCooldown } from '@features/territories/tabs';
import { isCoverage } from '@features/territories/coverage_rate';
import { tileUrls } from '@services/maps/tiles';
vi.mock('@features/territories/mockData', () => ({ STREET_INDEX: [] }));
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
  test('returns an unfinished territory without deleting old history', () => {
    const historical = assignment({ id: 'old', returnedOn: '01.02.2026' });
    const [result] = changedTerritories(
      [territory([historical, assignment()])],
      person,
      { resolutions: { t: { completed: false } } },
      now
    );
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments[0]).toEqual(historical);
    expect(result.assignments[1]).toMatchObject({
      publisher: 'Alex',
      returnedOn: '03.10.2026',
      completed: false,
    });
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
      { resolutions: { t: { target: 'Ben', completed: true } } },
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
        { resolutions: { t: { target: 'Ben', completed: false } } },
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
        { resolutions: { t: { completed: true } } },
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
    expect(isCoverage(source.assignments[0])).toBe(true);
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
  test('unfinished returns never count as completed coverage', () => {
    const source = territory([
      assignment({ returnedOn: '02.02.2026', completed: false }),
    ]);
    expect(
      s13Rows(source, 'dd.MM.yyyy', '', now)[0].entries[0].completedOn
    ).toBeUndefined();
    expect(isCoverage(source.assignments[0])).toBe(false);
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
      forTab(items, 'recommended', '', true, undefined, undefined, preferences)
    ).toEqual([]);
    expect(
      forTab(items, 'all', '', true, undefined, undefined, preferences)
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
