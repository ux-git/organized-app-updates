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
import { appLocalsState } from '@states/app_locals';
import { settingsState } from '@states/settings';
import { invoke, listen, nearby } from './native';
import { setCurrentPublisher, setMapCenter, setPeople } from './data';
import { seedBoundaries, seedDoNotCalls, seedPeople } from './seed';
import {
  avatarsFrom,
  avatarsState,
  bufferOf,
  linksFrom,
  linksState,
  myIdState,
  myLinkState,
  peopleState,
  PROFILES,
} from './profiles';

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

// every edit tells paired phones nearby at once (NearbyService.changed)
export const writeRows = (writes: Write[]) =>
  writes.length
    ? invoke<number>('store_write', { writes }).then((written) => {
        if (written) nearby('changed');
        return written;
      })
    : Promise.resolve(0);

const byDate = (field: string) => (a: Row, b: Row) =>
  (parseDate(String(a[field] ?? ''))?.getTime() ?? 0) -
  (parseDate(String(b[field] ?? ''))?.getTime() ?? 0);

export const split = (territory: Territory) => {
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

export const assemble = (
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

const sameName = (name: string) =>
  name.toLocaleLowerCase().replace(/\s+/g, ' ').trim();

let deviceName = '';

// "me" on the territory pages: the linked publisher, else this device's name
const applyMe = () => {
  const { person } = store.get(myLinkState);
  setCurrentPublisher(person?.name ?? deviceName);
  const uid = person?.id ?? '';
  store.set(settingsState, (settings) =>
    settings.user_settings.user_local_uid === uid
      ? settings
      : {
          ...settings,
          user_settings: { ...settings.user_settings, user_local_uid: uid },
        }
  );
};

/** A publisher named like this device, to offer linking to. */
export const suggestedLink = (name: string, people: Person[]) =>
  name.trim()
    ? people.find(
        (person) => !person.group && sameName(person.name) === sameName(name)
      )
    : undefined;

export const loadPeople = async () => {
  let people = (await rows(PEOPLE)) as unknown as Person[];

  // the same name under two ids (typed or imported on two phones, then
  // synced) is kept once; every phone keeps the same one
  const kept = new Map<string, Person>();
  const doubles: Person[] = [];
  for (const person of [...people].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `${person.group ? 'g' : 'p'}:${sameName(person.name)}`;
    if (kept.has(key)) doubles.push(person);
    else kept.set(key, person);
  }
  if (doubles.length) {
    await writeRows(
      doubles.map((person) => ({ table: PEOPLE, id: person.id, deleted: true }))
    );
    people = [...kept.values()];
  }

  const names = (group: boolean) =>
    people
      .filter((person) => !!person.group === group)
      .map((person) => person.name)
      .sort((a, b) => a.localeCompare(b));
  setPeople(names(true), names(false));
  store.set(peopleState, people);
  applyMe();
  window.dispatchEvent(new CustomEvent('people-changed', { detail: people }));
  return people;
};

export const loadIdentity = async () => {
  const identity = await invoke<{ id: string; name: string; unsynced: number }>(
    'identity'
  );
  deviceName = identity.name;
  store.set(myIdState, identity.id);
  applyMe();
  window.dispatchEvent(new CustomEvent('identity-changed'));
  return identity;
};

let shownAvatar: string | undefined;

export const loadProfiles = async () => {
  const profiles = await rows(PROFILES);
  const avatars = avatarsFrom(profiles);
  store.set(avatarsState, avatars);
  store.set(linksState, linksFrom(profiles));
  applyMe();
  // the main app's account button shows the account photo from app locals
  const mine = avatars[store.get(myIdState)];
  if (mine === shownAvatar) return;
  shownAvatar = mine;
  store.set(appLocalsState, mine ? [{ id: 1, avatar: bufferOf(mine) }] : []);
};

/** This device's picture for every paired device, or none with null. */
export const setAvatar = async (avatar: string | null) => {
  await writeRows([
    { table: PROFILES, id: store.get(myIdState), fields: { avatar } },
  ]);
  await loadProfiles();
};

/** Who uses this device, as a publisher's id, for every paired device. */
export const setLink = async (person: string | null) => {
  await writeRows([
    { table: PROFILES, id: store.get(myIdState), fields: { person } },
  ]);
  await loadProfiles();
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
    await seedPeople((await rows(PEOPLE)).length > 0);
    await seedBoundaries(territoryRows);
    doNotCallRows.push(...(await seedDoNotCalls(territoryRows, doNotCallRows)));
    await Promise.all([loadPeople(), loadIdentity()]);
    await loadProfiles();

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
 * With no list yet, the names on assignments start one; groups are the names
 * the imported data calls groups.
 */
const addPeople = async (territories: Territory[]) => {
  const names = new Set<string>();
  for (const territory of territories) {
    for (const assignment of territory.assignments) {
      if (assignment.publisher) names.add(assignment.publisher);
    }
    if (territory.holder) names.add(territory.holder);
  }
  const people = (await rows(PEOPLE)) as unknown as Person[];
  // only to start a list, e.g. from a Service Territory import; once there is
  // one (typed or imported), people who moved away don't come back from history
  if (people.length) return;
  const known = new Set(people.map((person) => person.name));
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
