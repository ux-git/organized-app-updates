import { changedTerritories, PublisherChange } from './publisherChanges';
import {
  DoNotCall,
  MapColor,
  Territory,
  TerritoryAssignment,
  TerritoryBoundary,
  TerritoryCampaign,
  TerritoryCategoryOption,
} from '@definition/territory';
import {
  congregationBorderColorState,
  congregationBorderDashedState,
  congregationBoundaryState,
  territoriesState,
  territoriesShowDoNotCallCountState,
  territoriesShowDoNotCallMapState,
  territoriesShowHouseholdsState,
  territoryCategoriesState,
  territoryOverdueMonthsState,
  territoryRecommendationsState,
} from '@states/territories';
import { parseDate } from '@features/territories/helpers';
import { store } from '@states/index';
import { appLocalsState } from '@states/app_locals';
import { settingsState } from '@states/settings';
import { Atom } from 'jotai';
import { invoke, listen, nearby } from './native';
import { setMapCenter } from './data';
import { currentPublisherState } from './assignees';
import { territoryCampaignsState } from './campaigns';
import {
  seedBoundaries,
  seedCongregation,
  seedDoNotCalls,
  seedPeople,
} from './seed';
import { positionOf } from './addresses';
import {
  isProfilePicture,
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
import { notify } from './pages/sync/text';
import { t } from './i18n';

// The territory pages keep their data in Jotai atoms. This mirrors the atoms
// into the phone's store, field by field, and reloads them when a sync
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

// a cleared field is stored as null, and read back as not there
const present = (row: Row) =>
  Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null)
  ) as Row;

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

// what the store holds, field by field as JSON, as last loaded or written
let saved = new Map<string, Record<string, string>>();

const json = (value: unknown) => JSON.stringify(value ?? null);

const remember = (write: Write) => {
  const at = key(write.table, write.id);
  if (write.deleted) {
    saved.delete(at);
    return;
  }
  const fields = { ...saved.get(at) };
  for (const [field, value] of Object.entries(write.fields ?? {})) {
    if (value == null) delete fields[field];
    else fields[field] = json(value);
  }
  saved.set(at, fields);
};

// only the fields that differ from the store, so a newer synced field in the
// same record stays; a cleared one goes as null
const changes = (record: Write): Write[] => {
  // a stored territory's record only counts as kept
  if (!record.fields) return [];
  const before = saved.get(key(record.table, record.id)) ?? {};
  const after = record.fields;
  const fields: Record<string, unknown> = {};
  for (const field of new Set([
    ...Object.keys(after),
    ...Object.keys(before),
  ])) {
    const value = after[field] ?? null;
    if (json(value) !== (before[field] ?? 'null')) fields[field] = value;
  }
  return Object.keys(fields).length ? [{ ...record, fields }] : [];
};

// a saved position wins; otherwise the house is looked up by its address, near
// the middle of its territory
const located =
  (near: [number, number]) =>
  (entry: DoNotCall): DoNotCall => {
    if (entry.position) return entry;
    const position = positionOf(entry.address, near);
    return position ? { ...entry, position } : entry;
  };

const middleOf = (boundary: unknown): [number, number] => {
  const points = Array.isArray(boundary)
    ? (boundary as [number, number][])
    : [];
  if (!points.length) return [0, 0];
  return [
    points.reduce((sum, [lng]) => sum + lng, 0) / points.length,
    points.reduce((sum, [, lat]) => sum + lat, 0) / points.length,
  ];
};

export const assemble = (
  territoryRows: Row[],
  assignmentRows: Row[],
  doNotCallRows: Row[]
): Territory[] => {
  // grouped once, not filtered and sorted again for every territory
  const byTerritory = (list: Row[]) => {
    const groups = new Map<unknown, Row[]>();
    for (const row of list) {
      const group = groups.get(row.territory);
      if (group) group.push(row);
      else groups.set(row.territory, [row]);
    }
    return groups;
  };
  const assignments = byTerritory(
    [...assignmentRows].sort(byDate('assignedOn'))
  );
  const doNotCalls = byTerritory(doNotCallRows);
  const children = (groups: Map<unknown, Row[]>, territory: string) =>
    (groups.get(territory) ?? [])
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map((row) => without(row, 'territory', 'order'));

  return territoryRows
    .map(
      (row) =>
        ({
          ...row,
          assignments: children(assignments, row.id) as TerritoryAssignment[],
          doNotCalls: (children(doNotCalls, row.id) as DoNotCall[]).map(
            located(middleOf(row.boundary))
          ),
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

export const sameName = (name: string) =>
  name.toLocaleLowerCase().replace(/\s+/g, ' ').trim();

let deviceName = '';

// "me" on the territory pages: the linked publisher, else this device's name
const applyMe = () => {
  const person =
    store.get(myLinkState).person ??
    suggestedLink(deviceName, store.get(peopleState));
  store.set(currentPublisherState, person?.name ?? deviceName);
  const uid = person?.id ?? '';
  const [firstname = '', ...remaining] = deviceName.trim().split(/\s+/);
  const lastname = remaining.join(' ');
  store.set(settingsState, (settings) =>
    settings.user_settings.user_local_uid === uid &&
    settings.user_settings.firstname.value === firstname &&
    settings.user_settings.lastname.value === lastname
      ? settings
      : {
          ...settings,
          user_settings: {
            ...settings.user_settings,
            user_local_uid: uid,
            firstname: {
              ...settings.user_settings.firstname,
              value: firstname,
            },
            lastname: { ...settings.user_settings.lastname, value: lastname },
          },
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
  const keyOf = (person: Person) =>
    `${person.group ? 'g' : 'p'}:${sameName(person.name)}`;
  for (const person of [...people].sort((a, b) => a.id.localeCompare(b.id))) {
    if (kept.has(keyOf(person))) doubles.push(person);
    else kept.set(keyOf(person), person);
  }
  if (doubles.length) {
    // devices linked to a removed double move to the one kept
    const moved = new Map(
      doubles.map((person) => [person.id, kept.get(keyOf(person))!.id])
    );
    const links = (await rows(PROFILES)).filter(
      (row) => typeof row.person === 'string' && moved.has(row.person)
    );
    await writeRows([
      ...doubles.map((person) => ({
        table: PEOPLE,
        id: person.id,
        deleted: true,
      })),
      ...links.map((row) => ({
        table: PROFILES,
        id: row.id,
        fields: { person: moved.get(row.person as string) },
      })),
    ]);
    people = [...kept.values()];
    if (links.length) await loadProfiles();
  }

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
  const illustration = isProfilePicture(mine);
  store.set(settingsState, (settings) => ({
    ...settings,
    user_settings: {
      ...settings.user_settings,
      user_avatar_type: {
        value: illustration ? mine : mine ? 'google' : 'default',
        updatedAt: new Date().toISOString(),
      },
    },
  }));
  store.set(
    appLocalsState,
    mine && !illustration ? [{ id: 1, avatar: bufferOf(mine) }] : []
  );
};

/** This device's picture for every paired device, or none with null. */
export const setAvatar = async (avatar: string | null) => {
  await writeRows([
    { table: PROFILES, id: store.get(myIdState), fields: { avatar } },
  ]);
  await loadProfiles();
  nearby('changed');
};

/** Who uses this device, as a publisher's id, for every paired device. */
export const setLink = async (person: string | null) => {
  await writeRows([
    { table: PROFILES, id: store.get(myIdState), fields: { person } },
  ]);
  await loadProfiles();
};

/**
 * On a new device, the profile of the device a restored backup came from,
 * to take over its publisher and picture.
 */
export const profileToAdopt = async (device: string) => {
  const me = store.get(myIdState);
  const profiles = await rows(PROFILES);
  if (device === me || profiles.some((row) => row.id === me)) return;
  const old = profiles.find((row) => row.id === device);
  return old?.person || old?.avatar ? old : undefined;
};

export const adoptProfile = async (old: Row) => {
  await writeRows([
    {
      table: PROFILES,
      id: store.get(myIdState),
      fields: { person: old.person ?? null, avatar: old.avatar ?? null },
    },
  ]);
  await loadProfiles();
};

const categoryWrites = (categories: TerritoryCategoryOption[]): Write[] =>
  categories.map((category, order) => ({
    table: CATEGORIES,
    id: category.id,
    fields: { ...category, order },
  }));

const settingWrite = (id: string, value: unknown): Write => ({
  table: SETTINGS,
  id,
  fields: { value: value ?? null },
});

type State = {
  territories: Territory[];
  categories: TerritoryCategoryOption[];
  boundary?: TerritoryBoundary;
  boundaryColor?: MapColor;
  boundaryDashed?: boolean;
  overdue?: number;
  showDoNotCallCount?: boolean;
  showDoNotCallMap?: boolean;
  showHouseholds?: boolean;
  recommendations?: import('@definition/territory').TerritoryRecommendations;
  campaigns?: TerritoryCampaign[];
};

const stateOf = (
  territoryRows: Row[],
  assignmentRows: Row[],
  doNotCallRows: Row[],
  categoryRows: Row[],
  settingRows: Row[]
): State => {
  const setting = (id: string) =>
    settingRows.find((row) => row.id === id)?.value;
  return {
    territories: assemble(territoryRows, assignmentRows, doNotCallRows),
    categories: [...categoryRows]
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map((row) => without(row, 'order')) as TerritoryCategoryOption[],
    boundary: setting('boundary') as TerritoryBoundary | undefined,
    boundaryColor: setting('boundary_color') as MapColor | undefined,
    boundaryDashed: setting('boundary_dashed') as boolean | undefined,
    overdue: setting('overdue_months') as number | undefined,
    showDoNotCallCount: setting('show_do_not_call_count') as
      | boolean
      | undefined,
    showDoNotCallMap: setting('show_do_not_call_map') as boolean | undefined,
    showHouseholds: setting('show_households') as boolean | undefined,
    recommendations: setting('recommendations') as State['recommendations'],
    campaigns: setting('campaigns') as TerritoryCampaign[] | undefined,
  };
};

const recordsOf = (state: State) =>
  new Map(
    [
      ...state.territories.flatMap(split),
      ...categoryWrites(state.categories),
      settingWrite('boundary', state.boundary),
      settingWrite('boundary_color', state.boundaryColor),
      settingWrite('boundary_dashed', state.boundaryDashed),
      settingWrite('overdue_months', state.overdue),
      settingWrite('show_do_not_call_count', state.showDoNotCallCount),
      settingWrite('show_do_not_call_map', state.showDoNotCallMap),
      settingWrite('show_households', state.showHouseholds),
      settingWrite('recommendations', state.recommendations),
      settingWrite('campaigns', state.campaigns),
    ].map((record) => [key(record.table, record.id), record])
  );

const rowsOf = (records: Map<string, Write>, table: string) =>
  [...records.values()]
    .filter((record) => record.table === table)
    .map((record) => present({ ...record.fields, id: record.id }));

// an atom and the records it is stored as; records missing from `tables`
// were deleted on the pages
type Part = { atom: Atom<unknown>; records: () => Write[]; tables: string[] };

// each territory as last loaded or written; only its id is compared then
let stored = new Map<string, Territory>();

const territoryPart: Part = {
  atom: territoriesState,
  records: () =>
    store.get(territoriesState).flatMap((territory) => {
      const records = split(territory);
      return stored.get(territory.id) === territory
        ? records.map(({ table, id }) => ({ table, id }))
        : records;
    }),
  tables: [TERRITORIES, ASSIGNMENTS, DO_NOT_CALLS],
};

const byId = (territories: Territory[]) =>
  new Map(territories.map((territory) => [territory.id, territory]));

const parts: Part[] = [
  {
    atom: territoriesShowHouseholdsState,
    records: () => [
      settingWrite(
        'show_households',
        store.get(territoriesShowHouseholdsState)
      ),
    ],
    tables: [],
  },
  {
    atom: territoriesShowDoNotCallCountState,
    records: () => [
      settingWrite(
        'show_do_not_call_count',
        store.get(territoriesShowDoNotCallCountState)
      ),
    ],
    tables: [],
  },
  {
    atom: territoriesShowDoNotCallMapState,
    records: () => [
      settingWrite(
        'show_do_not_call_map',
        store.get(territoriesShowDoNotCallMapState)
      ),
    ],
    tables: [],
  },
  {
    atom: territoryRecommendationsState,
    records: () => [
      settingWrite('recommendations', store.get(territoryRecommendationsState)),
    ],
    tables: [],
  },
  territoryPart,
  {
    atom: territoryCategoriesState,
    records: () => categoryWrites(store.get(territoryCategoriesState)),
    tables: [CATEGORIES],
  },
  {
    atom: congregationBoundaryState,
    records: () => [
      settingWrite('boundary', store.get(congregationBoundaryState)),
    ],
    tables: [],
  },
  {
    atom: congregationBorderDashedState,
    records: () => [
      settingWrite('boundary_dashed', store.get(congregationBorderDashedState)),
    ],
    tables: [],
  },
  {
    atom: congregationBorderColorState,
    records: () => [
      settingWrite('boundary_color', store.get(congregationBorderColorState)),
    ],
    tables: [],
  },
  {
    atom: territoryOverdueMonthsState,
    records: () => [
      settingWrite('overdue_months', store.get(territoryOverdueMonthsState)),
    ],
    tables: [],
  },
  {
    atom: territoryCampaignsState,
    records: () => [
      settingWrite('campaigns', store.get(territoryCampaignsState)),
    ],
    tables: [],
  },
];

const diff = (part: Part, records = part.records()) => {
  const kept = new Set(records.map((record) => key(record.table, record.id)));
  const writes = records.flatMap(changes);
  for (const at of saved.keys()) {
    const slash = at.indexOf('/');
    const table = at.slice(0, slash);
    if (part.tables.includes(table) && !kept.has(at)) {
      writes.push({ table, id: at.slice(slash + 1), deleted: true });
    }
  }
  return writes;
};

// the atoms changed on the pages since their last write
const dirty = new Set<Part>();
let applying = false;

// loads and writes take turns: a load never overlaps a write or another load
let queue: Promise<unknown> = Promise.resolve();
const enqueue = (task: () => Promise<void>) => {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
};

// a failed write is tried again by itself, waiting longer each time
const RETRY_DELAYS = [2000, 5000, 15000, 60000];
let failures = 0;
let retry: ReturnType<typeof setTimeout> | undefined;

const flush = async () => {
  clearTimeout(retry);
  const pending = [...dirty];
  dirty.clear();
  const territories = store.get(territoriesState);
  try {
    const writes = pending.flatMap((part) => diff(part));
    await writeRows(writes);
    // only once stored; a failed write stays a difference, tried again
    writes.forEach(remember);
    if (pending.includes(territoryPart)) stored = byId(territories);
    failures = 0;
  } catch (error) {
    pending.forEach((part) => dirty.add(part));
    console.error('territories: saving failed', error);
    if (!failures)
      notify(t('common.somethingWrong'), t('territories.notSaved'), 'error');
    retry = setTimeout(
      save,
      RETRY_DELAYS[Math.min(failures, RETRY_DELAYS.length - 1)]
    );
    failures += 1;
  }
};

let nextFlush: Promise<void> | undefined;
const save = () => {
  nextFlush ??= enqueue(() => {
    nextFlush = undefined;
    return flush();
  });
};

/** "M01" is written "M1": no zero before a single digit. */
export const unpadded = (number: string) =>
  number.replace(/^(\D*?)0+([1-9])$/, '$1$2');

// numbers from before are renamed once in the store, which syncs them on
const unpadNumbers = async (territories: Row[]) => {
  const writes: Write[] = [];
  for (const row of territories) {
    if (typeof row.number !== 'string') continue;
    const number = unpadded(row.number);
    if (number === row.number) continue;
    row.number = number;
    writes.push({ table: TERRITORIES, id: row.id, fields: { number } });
  }
  if (writes.length) await writeRows(writes);
};

const read = async () => {
  const [territoryRows, assignmentRows, doNotCallRows, categoryRows, settings] =
    (
      await Promise.all(
        [TERRITORIES, ASSIGNMENTS, DO_NOT_CALLS, CATEGORIES, SETTINGS].map(rows)
      )
    ).map((list) => list.map(present));
  await unpadNumbers(territoryRows);
  await seedPeople((await rows(PEOPLE)).length > 0);
  await seedBoundaries(territoryRows);
  doNotCallRows.push(
    ...(await seedDoNotCalls(territoryRows, doNotCallRows, settings))
  );
  settings.push(...(await seedCongregation(settings)));
  await Promise.all([loadPeople(), loadIdentity()]);
  await loadProfiles();

  let state = stateOf(
    territoryRows,
    assignmentRows,
    doNotCallRows,
    categoryRows,
    settings
  );
  const records = recordsOf(state);

  // edits the store doesn't have yet (made during this load, or not written)
  // stay on top of what it holds, and are written next
  const edits = [...dirty];
  dirty.clear();
  const pending: Write[] = [];
  const mine = new Map<string, Write>();
  for (const part of edits) {
    const current = part.records();
    current.forEach((record) => mine.set(key(record.table, record.id), record));
    const writes = diff(part, current);
    if (writes.length) dirty.add(part);
    pending.push(...writes);
  }

  if (pending.length) {
    const shown = new Map(records);
    for (const write of pending) {
      const at = key(write.table, write.id);
      if (write.deleted) {
        shown.delete(at);
        continue;
      }
      const base = shown.get(at) ?? mine.get(at)!;
      shown.set(at, { ...base, fields: { ...base.fields, ...write.fields } });
    }
    state = stateOf(
      rowsOf(shown, TERRITORIES),
      rowsOf(shown, ASSIGNMENTS),
      rowsOf(shown, DO_NOT_CALLS),
      rowsOf(shown, CATEGORIES),
      rowsOf(shown, SETTINGS)
    );
  }

  saved = new Map();
  records.forEach(remember);

  centerOf(
    state.boundary ??
      state.territories.flatMap((territory) => territory.boundary ?? [])
  );

  stored = byId(dirty.has(territoryPart) ? [] : state.territories);
  applying = true;
  try {
    store.set(territoriesState, state.territories);
    if (state.categories.length) {
      store.set(territoryCategoriesState, state.categories);
    }
    store.set(congregationBoundaryState, state.boundary);
    store.set(congregationBorderColorState, state.boundaryColor ?? 'red');
    store.set(congregationBorderDashedState, state.boundaryDashed ?? false);
    store.set(
      territoriesShowDoNotCallCountState,
      state.showDoNotCallCount ?? true
    );
    store.set(territoriesShowDoNotCallMapState, state.showDoNotCallMap ?? true);
    store.set(territoriesShowHouseholdsState, state.showHouseholds ?? true);
    if (state.overdue) store.set(territoryOverdueMonthsState, state.overdue);
    if (state.recommendations)
      store.set(territoryRecommendationsState, state.recommendations);
    store.set(territoryCampaignsState, state.campaigns ?? []);
  } finally {
    applying = false;
  }
  if (pending.length) save();
};

let nextLoad: Promise<void> | undefined;

/** Reads the store into the pages; a burst of calls makes one load. */
export const load = () =>
  (nextLoad ??= enqueue(() => {
    nextLoad = undefined;
    return read();
  }));

/**
 * Territories keep names, not ids, so a renamed publisher or group is
 * renamed on them too; persist() writes and syncs the change.
 */
export const renameOnTerritories = (renames: Map<string, string>) => {
  if (!renames.size) return;
  const to = (name?: string) => (name && renames.get(name)) || name;
  store.set(territoriesState, (territories) =>
    territories.map((territory) => {
      const next = {
        ...territory,
        holder: to(territory.holder),
        requestedBy: to(territory.requestedBy),
        assignments: territory.assignments.map((assignment) => ({
          ...assignment,
          publisher: to(assignment.publisher)!,
        })),
        doNotCalls: territory.doNotCalls.map((entry) => ({
          ...entry,
          addedBy: to(entry.addedBy)!,
        })),
      };
      return JSON.stringify(next) === JSON.stringify(territory)
        ? territory
        : next;
    })
  );
};

export const removePublisher = (person: Person, change: PublisherChange) =>
  enqueue(async () => {
    await flush();
    if (dirty.size)
      throw new Error('Save pending changes before removing a publisher.');
    const people = store.get(peopleState);
    if (
      !people.some((item) => item.id === person.id && item.name === person.name)
    )
      throw new Error('This publisher changed. Reopen the dialog.');
    if (
      change.mergeInto &&
      !people.some(
        (item) =>
          item.id === change.mergeInto!.id &&
          item.name === change.mergeInto!.name &&
          item.id !== person.id &&
          item.group === person.group
      )
    )
      throw new Error('Choose another publisher of the same kind.');
    for (const resolution of Object.values(change.resolutions)) {
      if (
        resolution.target &&
        !people.some(
          (item) => item.id !== person.id && item.name === resolution.target
        )
      )
        throw new Error('The selected publisher no longer exists.');
    }
    const before = store.get(territoriesState);
    const next = changedTerritories(before, person, change);
    const writes: Write[] = next.flatMap((territory, index) =>
      territory === before[index] ? [] : split(territory).flatMap(changes)
    );
    writes.push({ table: PEOPLE, id: person.id, deleted: true });
    for (const [id, linked] of Object.entries(store.get(linksState))) {
      if (linked === person.id)
        writes.push({
          table: PROFILES,
          id,
          fields: { person: change.mergeInto?.id ?? null },
        });
    }
    await writeRows(writes);
    writes
      .filter((write) => write.table !== PEOPLE && write.table !== PROFILES)
      .forEach(remember);
    applying = true;
    try {
      store.set(territoriesState, next);
      stored = byId(next);
    } finally {
      applying = false;
    }
    await loadPeople();
    await loadProfiles();
  });

/** Writes every change made on the pages to the store, until stopped. */
export const persist = () => {
  const stops = parts.map((part) =>
    store.sub(part.atom, () => {
      if (applying) return;
      dirty.add(part);
      save();
    })
  );

  // a sync from another device changed the store
  const unlisten = listen('store-changed', () => {
    load().catch((error) => console.error('territories: reload failed', error));
  }).catch((error) => {
    console.error('territories: listening failed', error);
    return () => {};
  });

  return () => {
    clearTimeout(retry);
    stops.forEach((stop) => stop());
    unlisten.then((stop) => stop());
  };
};
