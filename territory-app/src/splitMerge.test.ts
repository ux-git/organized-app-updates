import { expect, test } from 'vitest';
import {
  mergeBoundaries,
  nextNumber,
  splitBoundary,
} from '@features/territories/map/split_merge';
import { TerritoryBoundary } from '@definition/territory';

// about 110 m a side, near Berlin
const square = (x: number, y: number, size = 0.001): TerritoryBoundary => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];

const ORIGIN: [number, number] = [13.4, 52.5];

test('a line straight across splits a square into two pieces', () => {
  const [x, y] = ORIGIN;
  const result = splitBoundary(square(x, y), [
    [x + 0.0007, y - 0.0005],
    [x + 0.0007, y + 0.0015],
  ]);

  if ('error' in result) throw new Error('expected two pieces');
  const xs = (ring: TerritoryBoundary) => ring.map(([lng]) => lng);
  expect(Math.max(...xs(result.larger))).toBeCloseTo(x + 0.0007, 6);
  expect(Math.min(...xs(result.smaller))).toBeCloseTo(x + 0.0007, 6);
});

test('a line with a bend still cuts in two', () => {
  const [x, y] = ORIGIN;
  const result = splitBoundary(square(x, y), [
    [x - 0.0005, y + 0.0002],
    [x + 0.0005, y + 0.0008],
    [x + 0.0015, y + 0.0002],
  ]);

  expect('error' in result).toBe(false);
});

test('a line that does not cross the territory is refused', () => {
  const [x, y] = ORIGIN;

  expect(
    splitBoundary(square(x, y), [
      [x - 0.0005, y - 0.0005],
      [x + 0.0005, y + 0.0005],
    ])
  ).toEqual({ error: 'cross' });

  expect(
    splitBoundary(square(x, y), [
      [x + 0.002, y],
      [x + 0.003, y + 0.001],
    ])
  ).toEqual({ error: 'cross' });
});

test('two touching squares merge into one', () => {
  const [x, y] = ORIGIN;
  const result = mergeBoundaries(square(x, y), [square(x + 0.001, y)]);

  if ('error' in result) throw new Error('expected one polygon');
  const xs = result.boundary.map(([lng]) => lng);
  expect(Math.min(...xs)).toBeCloseTo(x, 7);
  expect(Math.max(...xs)).toBeCloseTo(x + 0.002, 7);
});

test('squares apart are not merged', () => {
  const [x, y] = ORIGIN;

  expect(mergeBoundaries(square(x, y), [square(x + 0.003, y)])).toEqual({
    error: 'apart',
  });
});

test('the next number keeps the prefix and skips taken ones', () => {
  expect(nextNumber('A12', ['A12', 'A13', 'B20'])).toBe('A12A');
  expect(nextNumber('7', ['7', '9', 'A10'])).toBe('7A');
  expect(nextNumber('A07', ['A07'])).toBe('A07A');
  expect(nextNumber('Nord', ['Nord', 'Nord-2'])).toBe('NORDA');
});
