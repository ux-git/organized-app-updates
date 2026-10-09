import polygonClipping, { Pair, Polygon } from 'polygon-clipping';
import { TerritoryBoundary } from '@definition/territory';

// the cut is a strip this many metres wide; pieces smaller than a square metre are crumbs
const CUT_WIDTH = 0.01;
const MIN_PIECE = 1;
// gaps this small between hand-drawn neighbours close up when they merge
const MIN_HOLE = 150;

const closed = (ring: Pair[]): Pair[] => {
  const [first, last] = [ring[0], ring[ring.length - 1]];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
};

const rounded = (ring: Pair[]): TerritoryBoundary =>
  ring.map(([lng, lat]) => [
    Math.round(lng * 1e7) / 1e7,
    Math.round(lat * 1e7) / 1e7,
  ]);

// metres per degree on a flat local projection, close enough here
const scaleAt = (lat: number) => ({
  kx: 111320 * Math.cos((lat * Math.PI) / 180),
  ky: 110540,
});

const ringArea = (ring: Pair[]) => {
  const { kx, ky } = scaleAt(ring[0][1]);
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky);
  }
  return Math.abs(sum / 2);
};

const strip = (line: Pair[]): Polygon[] => {
  const { kx, ky } = scaleAt(line[0][1]);
  const half = CUT_WIDTH / 2;

  return line.slice(1).flatMap((b, i) => {
    const a = line[i];
    const dx = (b[0] - a[0]) * kx;
    const dy = (b[1] - a[1]) * ky;
    const length = Math.hypot(dx, dy);
    if (length === 0) return [];
    const ox = ((-dy / length) * half) / kx;
    const oy = ((dx / length) * half) / ky;
    return [
      [
        [
          [a[0] + ox, a[1] + oy],
          [b[0] + ox, b[1] + oy],
          [b[0] - ox, b[1] - oy],
          [a[0] - ox, a[1] - oy],
          [a[0] + ox, a[1] + oy],
        ],
      ] as Polygon,
    ];
  });
};

export type SplitResult =
  | { larger: TerritoryBoundary; smaller: TerritoryBoundary }
  | { error: 'cross' };

export const splitBoundary = (
  boundary: TerritoryBoundary,
  line: [number, number][]
): SplitResult => {
  const cuts = strip(line);
  if (boundary.length < 3 || cuts.length === 0) return { error: 'cross' };

  const pieces = polygonClipping
    .difference([closed(boundary)], ...cuts)
    .filter((piece) => ringArea(piece[0]) >= MIN_PIECE);

  // a loop drawn inside would leave a piece with a hole, which no border can be
  if (pieces.length !== 2 || pieces.some((piece) => piece.length > 1)) {
    return { error: 'cross' };
  }

  const [larger, smaller] = pieces
    .map((piece) => piece[0])
    .sort((a, b) => ringArea(b) - ringArea(a));

  return { larger: rounded(larger), smaller: rounded(smaller) };
};

export type MergeResult =
  | { boundary: TerritoryBoundary }
  | { error: 'apart' | 'hole' };

export const mergeBoundaries = (
  boundary: TerritoryBoundary,
  others: TerritoryBoundary[]
): MergeResult => {
  const pieces = polygonClipping
    .union(
      [closed(boundary)],
      ...others.filter((ring) => ring.length >= 3).map((ring) => [closed(ring)])
    )
    .filter((piece) => ringArea(piece[0]) >= MIN_PIECE);

  if (pieces.length !== 1) return { error: 'apart' };

  const [outer, ...holes] = pieces[0];
  if (holes.some((hole) => ringArea(hole) >= MIN_HOLE)) {
    return { error: 'hole' };
  }

  return { boundary: rounded(outer) };
};

// the next number after this one with the same prefix, e.g. A12 → A13, or
// past the highest A-number already taken
export const nextNumber = (number: string, taken: string[]) => {
  const used = new Set(taken.map((item) => item.trim()));
  const match = number.trim().match(/^(.*?)(\d+)$/);

  if (match) {
    const [, prefix, digits] = match;
    const highest = Math.max(
      Number(digits),
      ...[...used]
        .filter(
          (item) =>
            item.startsWith(prefix) && /^\d+$/.test(item.slice(prefix.length))
        )
        .map((item) => Number(item.slice(prefix.length)))
    );
    const next = String(highest + 1).padStart(digits.length, '0');
    return `${prefix}${next}`;
  }

  let count = 2;
  while (used.has(`${number.trim()}-${count}`)) count++;
  return `${number.trim()}-${count}`;
};
