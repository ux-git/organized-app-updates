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
// Only filled in where a territory has no border, so an edit on a phone stays.
type Border = { boundary: [number, number][]; lines?: [number, number][][] };

const borders = Object.values(
  import.meta.glob<Record<string, Border>>('../seed/boundaries.json', {
    import: 'default',
    eager: true,
  })
)[0];

export const seedBoundaries = async (territories: Row[]) => {
  if (!borders) return;
  const writes = [];
  for (const row of territories) {
    const border = borders[String(row.number ?? '').trim()];
    if (!border || (Array.isArray(row.boundary) && row.boundary.length)) {
      continue;
    }
    const fields: Record<string, unknown> = { boundary: border.boundary };
    if (
      border.lines?.length &&
      !(Array.isArray(row.mapLines) && row.mapLines.length)
    ) {
      fields.mapLines = border.lines.map((path, index) => ({
        id: `seed-${row.id}-${index}`,
        path,
        style: 'dashed',
      }));
    }
    Object.assign(row, fields);
    writes.push({ table: 'territories', id: row.id, fields });
  }
  if (writes.length) await writeRows(writes);
};
