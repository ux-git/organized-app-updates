import { expect, test } from 'vitest';
import { lineCrossesPolygon } from '@features/territories/map/street_names';
import { TerritoryBoundary } from '@definition/territory';

const square: TerritoryBoundary = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

test('a line with a point inside the area counts', () => {
  expect(
    lineCrossesPolygon(
      [
        [5, 5],
        [20, 20],
      ],
      square
    )
  ).toBe(true);
});

test('a line passing through without a point inside counts', () => {
  expect(
    lineCrossesPolygon(
      [
        [-5, 5],
        [15, 5],
      ],
      square
    )
  ).toBe(true);
});

test('a line outside the area does not count', () => {
  expect(
    lineCrossesPolygon(
      [
        [12, 0],
        [12, 10],
        [20, 5],
      ],
      square
    )
  ).toBe(false);
});

test('a line in the notch of a concave area does not count', () => {
  const notched: TerritoryBoundary = [
    [0, 0],
    [10, 0],
    [10, 10],
    [6, 10],
    [6, 4],
    [4, 4],
    [4, 10],
    [0, 10],
  ];
  expect(
    lineCrossesPolygon(
      [
        [5, 6],
        [5, 9],
      ],
      notched
    )
  ).toBe(false);
});
