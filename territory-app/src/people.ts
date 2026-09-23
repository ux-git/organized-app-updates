import { loadPeople, PEOPLE, Person, writeRows } from './persistence';

// An Organized backup (Congregation settings, Import and export; or one
// converted from NW Scheduler) holds much more than names: addresses, phone
// numbers, reports. Only names and field service groups are taken.

type Value<T> = { value: T };

type BackupPerson = {
  person_uid: string;
  _deleted?: Value<boolean>;
  person_data: {
    person_firstname?: Value<string>;
    person_lastname?: Value<string>;
    person_display_name?: Value<string>;
    archived?: Value<boolean>;
    disqualified?: Value<boolean>;
  };
};

type BackupGroup = {
  group_id: string;
  group_data: {
    _deleted?: boolean;
    name?: string;
    sort_index: number;
  };
};

export type Incoming = { id: string; name: string; group: boolean };

export type ImportPlan = {
  add: Incoming[];
  update: Incoming[];
  unchanged: number;
  skipped: number;
  /** Names on this phone that the backup doesn't have. */
  missing: Person[];
};

const nameOf = ({ person_data: data }: BackupPerson) =>
  [data.person_firstname?.value, data.person_lastname?.value]
    .filter(Boolean)
    .join(' ')
    .trim() ||
  data.person_display_name?.value?.trim() ||
  '';

// the same label the territory pages give a group holder (groupHolderName)
const groupName = (group: BackupGroup['group_data']) => {
  const numbered = `Group ${group.sort_index + 1}`;
  return group.name ? `${numbered} – ${group.name}` : numbered;
};

export const readBackup = (text: string) => {
  const backup = JSON.parse(text);
  const data = backup?.data;
  if (!data || !Array.isArray(data.persons)) {
    throw new Error('This file is not an Organized backup.');
  }

  let skipped = 0;
  const incoming: Incoming[] = [];
  for (const person of data.persons as BackupPerson[]) {
    const gone =
      person._deleted?.value ||
      person.person_data.archived?.value ||
      person.person_data.disqualified?.value;
    const name = nameOf(person);
    if (gone || !name) {
      skipped += 1;
      continue;
    }
    incoming.push({ id: person.person_uid, name, group: false });
  }
  for (const group of (data.field_service_groups ?? []) as BackupGroup[]) {
    if (group.group_data._deleted) continue;
    incoming.push({
      id: group.group_id,
      name: groupName(group.group_data),
      group: true,
    });
  }
  return { incoming, skipped };
};

/** One name per line, for a few people or a list from elsewhere. */
export const readList = (text: string): Incoming[] =>
  [...new Set(text.split(/\r?\n/).map((line) => line.trim()))]
    .filter(Boolean)
    .map((name) => ({ id: crypto.randomUUID(), name, group: false }));

const key = (name: string) => name.toLocaleLowerCase().replace(/\s+/g, ' ');

/**
 * Matches by id first, then by name, so importing again, or after the
 * Service Territory import added the same names, doesn't make doubles.
 */
export const planImport = (
  people: Person[],
  incoming: Incoming[],
  skipped = 0
): ImportPlan => {
  const byId = new Map(people.map((person) => [person.id, person]));
  const byName = new Map(people.map((person) => [key(person.name), person]));
  const matched = new Set<string>();
  const plan: ImportPlan = {
    add: [],
    update: [],
    unchanged: 0,
    skipped,
    missing: [],
  };

  for (const entry of incoming) {
    const existing = byId.get(entry.id) ?? byName.get(key(entry.name));
    if (!existing) {
      plan.add.push(entry);
      continue;
    }
    matched.add(existing.id);
    if (existing.name === entry.name && existing.group === entry.group) {
      plan.unchanged += 1;
    } else {
      plan.update.push({ ...entry, id: existing.id });
    }
  }
  // a pasted list has no groups, so it only replaces names
  const withGroups = incoming.some((entry) => entry.group);
  plan.missing = people.filter(
    (person) => !matched.has(person.id) && (withGroups || !person.group)
  );
  return plan;
};

export const applyImport = async (plan: ImportPlan, removeMissing: boolean) => {
  await writeRows([
    ...[...plan.add, ...plan.update].map(({ id, name, group }) => ({
      table: PEOPLE,
      id,
      fields: { name, group },
    })),
    ...(removeMissing ? plan.missing : []).map((person) => ({
      table: PEOPLE,
      id: person.id,
      deleted: true,
    })),
  ]);
  return loadPeople();
};
