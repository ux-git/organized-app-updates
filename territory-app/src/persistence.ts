import {
  DoNotCall,
  Territory,
  TerritoryAssignment,
  TerritoryBoundary,
  TerritoryCategoryOption,
} from '@definition/territory';
import {
  congregationBoundaryState,
  territoriesState,
  territoryCategoriesState,
  territoryOverdueMonthsState,
} from '@states/territories';
import { parseDate } from '@features/territories/helpers';
import { store } from '@states/index';
import { invoke, listen } from './native';
import { setCurrentPublisher, setMapCenter, setPeople } from './data';

// The territory pages keep their data in Jotai atoms. This mirrors the atoms
// into the phone's store, record by record, and reloads them when a sync
// brings changes. Assignments and do-not-calls are records of their own, so
// two phones adding to the same territory offline both keep their entries.

type Row = Record<string, unknown> & { id: string };
type Write = {
  table: string;
  id: string;
  fields?: Record<string, unknown>;
  deleted?: boolean;
};

export type Person = { id: string; name: string; group: boolean };

const TERRITORIES = 'territories';
const ASSIGNMENTS = 'assignments';
const DO_NOT_CALLS = 'do_not_calls';
const CATEGORIES = 'categories';
const SETTINGS = 'settings';
export const PEOPLE = 'people';

const rows = (table: string) => invoke<Row[]>('store_list', { table });

export const writeRows = (writes: Write[]) =>
  writes.length
    ? invoke<number>('store_write', { writes })
    : Promise.resolve(0);

const byDate = (field: string) => (a: Row, b: Row) =>
  (parseDate(String(a[field] ?? ''))?.getTime() ?? 0) -
  (parseDate(String(b[field] ?? ''))?.getTime() ?? 0);

const split = (territory: Territory) => {
  const { assignments, doNotCalls, ...fields } = territory;
  const records: Write[] = [{ table: TERRITORIES, id: territory.id, fields }];
  for (const [index, assignment] of assignments.entries()) {
    records.push({
      table: ASSIGNMENTS,
      id: assignment.id,
      fields: { ...assignment, territory: territory.id, order: index },
    });
  }
  for (const [index, entry] of doNotCalls.entries()) {
    records.push({
      table: DO_NOT_CALLS,
      id: entry.id,
      fields: { ...entry, territory: territory.id, order: index },
    });
  }
  return records;
};

const key = (table: string, id: string) => `${table}/${id}`;

const without = (row: Row, ...fields: string[]) =>
  Object.fromEntries(
    Object.entries(row).filter(([field]) => !fields.includes(field))
  );

// what the store holds, as last written or loaded, to write only changes
let saved = new Map<string, string>();
let loading = false;

const remember = (write: Write) => {
  if (write.deleted) saved.delete(key(write.table, write.id));
  else saved.set(key(write.table, write.id), JSON.stringify(write.fields));
};

const changed = (writes: Write[]) =>
  writes.filter(
    (write) =>
      write.deleted ||
      saved.get(key(write.table, write.id)) !== JSON.stringify(write.fields)
  );

const assemble = (
  territoryRows: Row[],
  assignmentRows: Row[],
  doNotCallRows: Row[]
): Territory[] => {
  const children = (list: Row[], territory: string) =>
    list
      .filter((row) => row.territory === territory)
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map((row) => without(row, 'territory', 'order'));

  return territoryRows
    .map(
      (row) =>
        ({
          ...row,
          assignments: children(
            [...assignmentRows].sort(byDate('assignedOn')),
            row.id
          ) as TerritoryAssignment[],
          doNotCalls: children(doNotCallRows, row.id) as DoNotCall[],
        }) as unknown as Territory
    )
    .sort((a, b) =>
      a.number.localeCompare(b.number, undefined, { numeric: true })
    );
};

const centerOf = (points: [number, number][]) => {
  if (!points.length) return;
  const lng = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const lat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  setMapCenter([lng, lat]);
};

export const loadPeople = async () => {
  const people = (await rows(PEOPLE)) as unknown as Person[];
  const names = (group: boolean) =>
    people
      .filter((person) => !!person.group === group)
      .map((person) => person.name)
      .sort((a, b) => a.localeCompare(b));
  setPeople(names(true), names(false));
  return people;
};

export const loadIdentity = async () => {
  const identity = await invoke<{ name: string; unsynced: number }>('identity');
  setCurrentPublisher(identity.name);
  return identity;
};

export const load = async () => {
  loading = true;
  try {
    const [
      territoryRows,
      assignmentRows,
      doNotCallRows,
      categoryRows,
      settings,
    ] = await Promise.all([
      rows(TERRITORIES),
      rows(ASSIGNMENTS),
      rows(DO_NOT_CALLS),
      rows(CATEGORIES),
      rows(SETTINGS),
    ]);
    await Promise.all([loadPeople(), loadIdentity()]);

    const territories = assemble(territoryRows, assignmentRows, doNotCallRows);
    const categories = categoryRows
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map((row) => without(row, 'order')) as TerritoryCategoryOption[];
    const setting = (id: string) =>
      settings.find((row) => row.id === id)?.value;
    const boundary = (setting('boundary') ?? undefined) as
      | TerritoryBoundary
      | undefined;
    const overdue = (setting('overdue_months') ?? undefined) as
      | number
      | undefined;

    centerOf(
      boundary ?? territories.flatMap((territory) => territory.boundary ?? [])
    );

    saved = new Map();
    territories.flatMap(split).forEach(remember);
    categoryWrites(categories).forEach(remember);
    settingWrites(boundary, overdue).forEach(remember);

    store.set(territoriesState, territories);
    if (categories.length) store.set(territoryCategoriesState, categories);
    store.set(congregationBoundaryState, boundary);
    if (overdue) store.set(territoryOverdueMonthsState, overdue);
  } finally {
    loading = false;
  }
};

const categoryWrites = (categories: TerritoryCategoryOption[]): Write[] =>
  categories.map((category, order) => ({
    table: CATEGORIES,
    id: category.id,
    fields: { ...category, order },
  }));

const settingWrites = (
  boundary: TerritoryBoundary | undefined,
  overdue: number | undefined
): Write[] => [
  { table: SETTINGS, id: 'boundary', fields: { value: boundary ?? null } },
  { table: SETTINGS, id: 'overdue_months', fields: { value: overdue ?? null } },
];

const save = (writes: Write[]) => {
  const pending = changed(writes);
  if (!pending.length) return;
  pending.forEach(remember);
  writeRows(pending).catch((error) =>
    console.error('territories: saving failed', error)
  );
};

const removedChildren = (before: Territory, after?: Territory): Write[] => {
  const gone = <T extends { id: string }>(list: T[], next: T[] = []) =>
    list.filter((item) => !next.some((other) => other.id === item.id));
  return [
    ...gone(before.assignments, after?.assignments).map((a) => ({
      table: ASSIGNMENTS,
      id: a.id,
      deleted: true,
    })),
    ...gone(before.doNotCalls, after?.doNotCalls).map((d) => ({
      table: DO_NOT_CALLS,
      id: d.id,
      deleted: true,
    })),
  ];
};

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Names on assignments (from an import, or typed in) join the pickers'
 * list; groups are the names the imported data calls groups.
 */
const addPeople = async (territories: Territory[]) => {
  const names = new Set<string>();
  for (const territory of territories) {
    for (const assignment of territory.assignments) {
      if (assignment.publisher) names.add(assignment.publisher);
    }
    if (territory.holder) names.add(territory.holder);
  }
  const known = new Set(
    ((await rows(PEOPLE)) as unknown as Person[]).map((person) => person.name)
  );
  const writes = [...names]
    .filter((name) => !known.has(name))
    .map((name) => ({
      table: PEOPLE,
      id: slug(name) || name,
      fields: { name, group: /^group\b|^gruppe\b/i.test(name) },
    }));
  if (!writes.length) return;
  await writeRows(writes);
  await loadPeople();
};

/** Writes every change made on the pages to the store. */
export const persist = () => {
  let previous = store.get(territoriesState);
  store.sub(territoriesState, () => {
    const next = store.get(territoriesState);
    const before = previous;
    previous = next;
    if (loading) return;

    const writes: Write[] = [];
    for (const territory of next) {
      const old = before.find((item) => item.id === territory.id);
      if (old === territory) continue;
      writes.push(...split(territory));
      if (old) writes.push(...removedChildren(old, territory));
    }
    for (const old of before) {
      if (next.some((item) => item.id === old.id)) continue;
      writes.push({ table: TERRITORIES, id: old.id, deleted: true });
      writes.push(...removedChildren(old));
    }
    save(writes);
    addPeople(next).catch(() => {});
  });

  addPeople(store.get(territoriesState)).catch(() => {});

  store.sub(territoryCategoriesState, () => {
    if (loading) return;
    const categories = store.get(territoryCategoriesState);
    const deleted = [...saved.keys()]
      .filter((k) => k.startsWith(`${CATEGORIES}/`))
      .map((k) => k.slice(CATEGORIES.length + 1))
      .filter((id) => !categories.some((category) => category.id === id))
      .map((id) => ({ table: CATEGORIES, id, deleted: true }));
    save([...categoryWrites(categories), ...deleted]);
  });

  const saveSettings = () => {
    if (loading) return;
    save(
      settingWrites(
        store.get(congregationBoundaryState),
        store.get(territoryOverdueMonthsState)
      )
    );
  };
  store.sub(congregationBoundaryState, saveSettings);
  store.sub(territoryOverdueMonthsState, saveSettings);

  // a sync from another phone changed the store
  return listen('store-changed', () => {
    load().catch((error) => console.error('territories: reload failed', error));
  });
};
