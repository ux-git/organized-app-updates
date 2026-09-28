import { describe, expect, test, vi } from 'vitest';
import {
  Border,
  borderFields,
  byKey,
  doNotCallWrites,
  Entry,
  farOff,
  hash,
  keyOf,
} from './seed';

vi.mock('./persistence', () => ({ PEOPLE: 'people', writeRows: vi.fn() }));

type Point = [number, number];

const square = (lng: number, lat: number): Point[] => [
  [lng, lat],
  [lng + 0.01, lat],
  [lng + 0.01, lat + 0.01],
  [lng, lat + 0.01],
];

describe('keyOf', () => {
  test('"M1", "M 1", "m01" and "M001" are one territory', () => {
    for (const number of ['M1', 'M 1', 'm01', 'M001', ' M01 ']) {
      expect(keyOf(number)).toBe('M1');
    }
  });

  test('keeps other numbers apart', () => {
    expect(keyOf('M10')).toBe('M10');
    expect(keyOf('M10')).not.toBe(keyOf('M1'));
    expect(keyOf('007')).toBe('7');
    expect(keyOf('0')).toBe('0');
    expect(keyOf(12)).toBe('12');
    expect(keyOf(undefined)).toBe('');
  });

  test('byKey looks entries up the same way', () => {
    expect(byKey({ 'M 01': 'x' }).get(keyOf('M1'))).toBe('x');
    expect(byKey(undefined).size).toBe(0);
  });
});

describe('farOff', () => {
  test('a border near its seeded one is an edit', () => {
    expect(farOff(square(6.47, 51.67), square(6.48, 51.66))).toBe(false);
  });

  test('a border drawn elsewhere is a mistake', () => {
    // the map's old Berlin default against Xanten
    expect(farOff(square(13.4, 52.52), square(6.47, 51.67))).toBe(true);
    expect(farOff(square(6.47, 52.0), square(6.47, 51.67))).toBe(true);
  });
});

describe('borderFields', () => {
  const border: Border = {
    boundary: square(6.47, 51.67),
    lines: [
      [
        [6.47, 51.67],
        [6.48, 51.68],
      ],
    ],
  };

  test('fills a territory without a border, with dashed lines', () => {
    expect(borderFields({ id: 't1', boundary: [] }, border)).toEqual({
      boundary: border.boundary,
      mapLines: [{ id: 'seed-t1-0', path: border.lines![0], style: 'dashed' }],
    });
  });

  test('keeps a border drawn on the device', () => {
    const drawn = square(6.475, 51.672);
    expect(borderFields({ id: 't1', boundary: drawn }, border)).toBeUndefined();
  });

  test('replaces an earlier seeded border and one drawn far off', () => {
    const earlier = square(6.476, 51.671);
    const replacing = { ...border, replaces: [hash(earlier)] };
    expect(
      borderFields({ id: 't1', boundary: earlier }, replacing)?.boundary
    ).toBe(border.boundary);
    expect(
      borderFields({ id: 't1', boundary: square(13.4, 52.52) }, border)
        ?.boundary
    ).toBe(border.boundary);
  });

  test('leaves lines drawn on the device', () => {
    const fields = borderFields(
      { id: 't1', mapLines: [{ id: 'mine', path: [] }] },
      border
    );
    expect(fields).toEqual({ boundary: border.boundary });
  });

  test('nothing without a seeded border', () => {
    expect(borderFields({ id: 't1' }, undefined)).toBeUndefined();
  });
});

describe('doNotCallWrites', () => {
  const entries: Record<string, Entry[]> = {
    M01: [
      { date: '01.02.2025', address: 'Main 1', name: 'A' },
      { date: '03.04.2025', address: 'Main 2' },
    ],
    M2: [{ date: '05.06.2025', address: 'Side 3' }],
  };
  const data = byKey(entries);

  test('seeds a territory by its number, with ids the same everywhere', () => {
    const writes = doNotCallWrites([{ id: 'abc', number: 'M 1' }], [], data);
    expect(writes).toEqual([
      {
        table: 'do_not_calls',
        id: 'seed-dnc-m1-0',
        fields: {
          id: 'seed-dnc-m1-0',
          date: '01.02.2025',
          address: 'Main 1',
          name: 'A',
          addedBy: '',
          territory: 'abc',
          order: 0,
        },
      },
      {
        table: 'do_not_calls',
        id: 'seed-dnc-m1-1',
        fields: {
          id: 'seed-dnc-m1-1',
          date: '03.04.2025',
          address: 'Main 2',
          addedBy: '',
          territory: 'abc',
          order: 1,
        },
      },
      {
        table: 'settings',
        id: 'seeded_do_not_calls',
        fields: { id: 'seeded_do_not_calls', abc: true },
      },
    ]);
  });

  test('skips a territory that already has do-not-calls', () => {
    const writes = doNotCallWrites(
      [
        { id: 'a', number: 'M1' },
        { id: 'b', number: 'M2' },
      ],
      [{ id: 'mine', territory: 'a' }],
      data
    );
    expect(writes.map((write) => write.id)).toEqual([
      'seed-dnc-m2-0',
      'seeded_do_not_calls',
    ]);
    // its turn has passed too, so removing them later brings nothing back
    expect(writes[1].fields).toEqual({
      id: 'seeded_do_not_calls',
      a: true,
      b: true,
    });
  });

  test('never seeds a territory twice, even after its entries were removed', () => {
    const territories = [
      { id: 'a', number: 'M1' },
      { id: 'b', number: 'M2' },
    ];
    expect(
      doNotCallWrites(territories, [], data, { a: true, b: true })
    ).toEqual([]);
    expect(
      doNotCallWrites(territories, [], data, { a: true }).map(
        (write) => write.id
      )
    ).toEqual(['seed-dnc-m2-0', 'seeded_do_not_calls']);
  });

  test('skips territories without seeded entries', () => {
    expect(doNotCallWrites([{ id: 'x', number: 'M9' }], [], data)).toEqual([]);
    expect(
      doNotCallWrites([{ id: 'x', number: 'M1' }], [], byKey({ M1: [] }))
    ).toEqual([]);
  });
});
