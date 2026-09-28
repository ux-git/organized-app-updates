import { PEOPLE, writeRows } from './persistence';

type Row = Record<string, unknown> & { id: string };

// A private build can start with the congregation's names: text files in
// territory-app/seed (ignored by git), one name per line. They are only used
// while the phone has no names yet.
const files = import.meta.glob<string>('../seed/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const lines = (name: string) =>
  (files[`../seed/${name}.txt`] ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

// the same id on every phone, so two phones seeded apart don't double up
const idOf = (name: string) =>
  `seed-${name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;

export const seedPeople = async (hasPeople: boolean) => {
  if (hasPeople) return;
  const writes = [
    ...lines('groups').map((name) => ({ name, group: true })),
    ...lines('publishers').map((name) => ({ name, group: false })),
  ].map((fields) => ({ table: PEOPLE, id: idOf(fields.name), fields }));
  if (writes.length) await writeRows(writes);
};

// Territory borders and the dashed lines between their parts, from
// seed/boundaries.json: { "M12": { "boundary": [[lng, lat], ...], "lines": [...] } }.
// Filled in where a territory has no border, or still has an earlier seeded
// one (listed by its hash in "replaces"), so an edit on a phone stays.
export type Border = {
  boundary: [number, number][];
  lines?: [number, number][][];
  replaces?: string[];
};

export const hash = (value: unknown) => {
  const text = JSON.stringify(value);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h * 33 + text.charCodeAt(i)) >>> 0;
  return h.toString(16);
};

// "M1", "M 1" and "M01" are the same territory
export const keyOf = (number: unknown) =>
  String(number ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^([A-Z]*)0*(\d)/, '$1$2');

export const byKey = <T>(data: Record<string, T> | undefined) =>
  new Map(
    Object.entries(data ?? {}).map(([key, value]) => [keyOf(key), value])
  );

// a border drawn far from its seeded one (e.g. on the map's old Berlin
// default) is a mistake, not an edit to keep
export const farOff = (
  drawn: [number, number][],
  seeded: [number, number][]
) => {
  const mean = (points: [number, number][]) =>
    points.reduce(
      ([x, y], [lng, lat]) => [
        x + lng / points.length,
        y + lat / points.length,
      ],
      [0, 0]
    );
  const [a, b] = [mean(drawn), mean(seeded)];
  return Math.abs(a[0] - b[0]) > 0.3 || Math.abs(a[1] - b[1]) > 0.3;
};

const borders = Object.values(
  import.meta.glob<Record<string, Border>>('../seed/boundaries.json', {
    import: 'default',
    eager: true,
  })
)[0];

const borderByKey = byKey(borders);

/** The seeded border (and lines) a territory takes, if it takes one. */
export const borderFields = (row: Row, border: Border | undefined) => {
  const drawn = Array.isArray(row.boundary) && row.boundary.length > 0;
  const replaceable =
    !drawn ||
    border?.replaces?.includes(hash(row.boundary)) ||
    (border && farOff(row.boundary as [number, number][], border.boundary));
  if (!border || !replaceable) return;
  const fields: Record<string, unknown> = { boundary: border.boundary };
  const lines = Array.isArray(row.mapLines) ? row.mapLines : [];
  const onlySeeded = lines.every((line: { id?: string }) =>
    String(line?.id).startsWith('seed-')
  );
  if (border.lines?.length && onlySeeded) {
    fields.mapLines = border.lines.map((path, index) => ({
      id: `seed-${row.id}-${index}`,
      path,
      style: 'dashed',
    }));
  }
  return fields;
};

export const seedBoundaries = async (territories: Row[]) => {
  if (!borders) return;
  const writes = [];
  for (const row of territories) {
    const fields = borderFields(row, borderByKey.get(keyOf(row.number)));
    if (!fields) continue;
    Object.assign(row, fields);
    writes.push({ table: 'territories', id: row.id, fields });
  }
  if (writes.length) await writeRows(writes);
};

// Do-not-call addresses, from seed/donotcalls.json:
// { "M12": [{ "date": "dd.mm.yyyy", "address": "…", "name": "…" }] }.
// Once for a territory that has none yet, with the same ids on every phone.
// The store keeps which territories had their turn, so removed entries don't
// come back, on this device or a paired one.
export type Entry = { date: string; address: string; name?: string };

const SEEDED = 'seeded_do_not_calls';

const doNotCalls = Object.values(
  import.meta.glob<Record<string, Entry[]>>('../seed/donotcalls.json', {
    import: 'default',
    eager: true,
  })
)[0];

const doNotCallByKey = byKey(doNotCalls);

export const doNotCallWrites = (
  territories: Row[],
  existing: Row[],
  byNumber: Map<string, Entry[]>,
  seeded: Record<string, unknown> = {}
) => {
  const taken = new Set(existing.map((row) => row.territory));
  const writes: { table: string; id: string; fields: Row }[] = [];
  const done: Record<string, boolean> = {};
  for (const row of territories) {
    const number = keyOf(row.number);
    const entries = byNumber.get(number);
    if (!entries?.length || seeded[row.id]) continue;
    done[row.id] = true;
    if (taken.has(row.id)) continue;
    entries.forEach((entry, order) => {
      const id = `seed-dnc-${number.toLowerCase()}-${order}`;
      writes.push({
        table: 'do_not_calls',
        id,
        fields: { id, ...entry, addedBy: '', territory: row.id, order },
      });
    });
  }
  if (Object.keys(done).length) {
    writes.push({
      table: 'settings',
      id: SEEDED,
      fields: { id: SEEDED, ...done },
    });
  }
  return writes;
};

export const seedDoNotCalls = async (
  territories: Row[],
  existing: Row[],
  settings: Row[]
) => {
  if (!doNotCalls) return [];
  const seeded = settings.find((row) => row.id === SEEDED);
  const writes = doNotCallWrites(territories, existing, doNotCallByKey, seeded);
  if (writes.length) await writeRows(writes);
  return writes
    .filter((write) => write.table === 'do_not_calls')
    .map((write) => write.fields);
};
