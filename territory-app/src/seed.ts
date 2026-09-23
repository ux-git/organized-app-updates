import { PEOPLE, writeRows } from './persistence';

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
