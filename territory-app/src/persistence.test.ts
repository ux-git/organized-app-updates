import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { Territory } from '@definition/territory';
import { createStore } from 'jotai';
import { store } from '@states/index';
import { appLocalsState } from '@states/app_locals';
import { settingsState } from '@states/settings';
import {
  territoriesWithStatusState,
  territoriesState,
  territoriesShowHouseholdsState,
  territoriesShowDoNotCallCountState,
  territoryOverdueMonthsState,
  territoryRecommendationsState,
} from '@states/territories';
import { currentPublisherState, territoryAssigneesState } from './assignees';
import { territoryCampaignsState } from './campaigns';
import { restoreTerritory } from '@features/territories/restore';
import { invoke, listen } from './native';
import { notify } from './pages/sync/text';
import {
  assemble,
  unpadded,
  load,
  loadIdentity,
  loadPeople,
  loadProfiles,
  persist,
  renameOnTerritories,
  setAvatar,
  setLink,
  split,
  suggestedLink,
} from './persistence';
import {
  avatarsState,
  linkOf,
  peopleState,
  linksState,
  myAvatarState,
  myIdState,
  myLinkState,
} from './profiles';

vi.mock('./native', () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  nearby: vi.fn(),
}));
vi.mock('./seed', () => ({
  seedPeople: async () => {},
  seedBoundaries: async () => {},
  seedDoNotCalls: async () => [],
  seedCongregation: async () => [],
}));
vi.mock('./pages/sync/text', () => ({ notify: vi.fn() }));

type Row = Record<string, unknown> & { id: string };

const territory = (fields: Record<string, unknown>) =>
  ({ assignments: [], doNotCalls: [], ...fields }) as unknown as Territory;

describe('split', () => {
  test('a territory, its assignments and do-not-calls as records', () => {
    const writes = split(
      territory({
        id: 't1',
        number: '7',
        assignments: [
          { id: 'a2', publisher: 'Ben', assignedOn: '01.02.2026' },
          { id: 'a1', publisher: 'Anna', assignedOn: '01.01.2026' },
        ],
        doNotCalls: [{ id: 'd1', address: 'Main 1' }],
      })
    );
    expect(writes).toEqual([
      { table: 'territories', id: 't1', fields: { id: 't1', number: '7' } },
      {
        table: 'assignments',
        id: 'a2',
        fields: {
          id: 'a2',
          publisher: 'Ben',
          assignedOn: '01.02.2026',
          territory: 't1',
          order: 0,
        },
      },
      {
        table: 'assignments',
        id: 'a1',
        fields: {
          id: 'a1',
          publisher: 'Anna',
          assignedOn: '01.01.2026',
          territory: 't1',
          order: 1,
        },
      },
      {
        table: 'do_not_calls',
        id: 'd1',
        fields: { id: 'd1', address: 'Main 1', territory: 't1', order: 0 },
      },
    ]);
  });
});

describe('assemble', () => {
  test('puts records back together, sorted by number', () => {
    const territories: Row[] = [
      { id: 't10', number: '10' },
      { id: 't2', number: '2' },
      { id: 'm1', number: 'M1' },
    ];
    // two devices each added one at the same place while apart
    const assignments: Row[] = [
      {
        id: 'a1',
        territory: 't2',
        publisher: 'Anna',
        assignedOn: '03.01.2026',
        order: 1,
      },
      {
        id: 'a2',
        territory: 't2',
        publisher: 'Ben',
        assignedOn: '01.01.2026',
        order: 1,
      },
      {
        id: 'a0',
        territory: 't2',
        publisher: 'Carl',
        assignedOn: '05.01.2026',
        order: 0,
      },
    ];
    const doNotCalls: Row[] = [
      { id: 'd2', territory: 't10', address: 'B', order: 1 },
      { id: 'd1', territory: 't10', address: 'A', order: 0 },
    ];

    const result = assemble(territories, assignments, doNotCalls);

    expect(result.map((item) => item.number)).toEqual(['2', '10', 'M1']);
    // in their order, and by date where two share a place
    expect(result[0].assignments).toEqual([
      { id: 'a0', publisher: 'Carl', assignedOn: '05.01.2026' },
      { id: 'a2', publisher: 'Ben', assignedOn: '01.01.2026' },
      { id: 'a1', publisher: 'Anna', assignedOn: '03.01.2026' },
    ]);
    expect(result[1].doNotCalls).toEqual([
      { id: 'd1', address: 'A' },
      { id: 'd2', address: 'B' },
    ]);
    expect(result[2].assignments).toEqual([]);
    expect(result[2].doNotCalls).toEqual([]);
  });

  test('split and assemble round-trip', () => {
    const original = territory({
      id: 't1',
      number: '1',
      assignments: [
        { id: 'a1', publisher: 'Anna', assignedOn: '01.01.2026' },
        { id: 'a2', publisher: 'Ben', assignedOn: '01.02.2026' },
      ],
      doNotCalls: [
        { id: 'd1', address: 'Main 1' },
        { id: 'd2', address: 'Main 2' },
      ],
    });
    const writes = split(original);
    const rows = (table: string) =>
      writes
        .filter((write) => write.table === table)
        .map((write) => ({ ...write.fields, id: write.id }) as Row);

    expect(
      assemble(rows('territories'), rows('assignments'), rows('do_not_calls'))
    ).toEqual([original]);
  });
});

describe('profiles', () => {
  const picture = `data:image/webp;base64,${btoa('pic')}`;

  test('a picture per device id, and this device’s for the account button', async () => {
    store.set(myIdState, 'me');
    vi.mocked(invoke).mockResolvedValueOnce([
      { id: 'me', avatar: picture },
      { id: 'anna', avatar: picture },
      { id: 'ben', avatar: null },
      { id: 'carl', avatar: 'https://example.com/x.png' },
    ]);
    await loadProfiles();

    expect(invoke).toHaveBeenCalledWith('store_list', { table: 'profiles' });
    expect(store.get(avatarsState)).toEqual({ me: picture, anna: picture });
    expect(store.get(myAvatarState)).toBe(picture);
    const [local] = store.get(appLocalsState);
    expect(new TextDecoder().decode(local.avatar)).toBe('pic');
  });

  test('setting and removing it writes this device’s record', async () => {
    store.set(myIdState, 'me');
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === 'store_write' ? 1 : []
    );

    await setAvatar(picture);
    expect(invoke).toHaveBeenCalledWith('store_write', {
      writes: [{ table: 'profiles', id: 'me', fields: { avatar: picture } }],
    });

    await setAvatar(null);
    expect(invoke).toHaveBeenCalledWith('store_write', {
      writes: [{ table: 'profiles', id: 'me', fields: { avatar: null } }],
    });
    expect(store.get(myAvatarState)).toBeUndefined();
    expect(store.get(appLocalsState)).toEqual([]);
  });
});

describe('linked publisher', () => {
  const people = [
    { id: 'p1', name: 'Anna Muster', group: false },
    { id: 'p2', name: 'Ben Beispiel', group: false },
    { id: 'g1', name: 'Group 1', group: true },
  ];

  const fake = (profiles: Row[], list = people) =>
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === 'identity') return { id: 'me', name: 'Tom’s phone' };
      if (command === 'store_write') return 1;
      const table = (args as { table: string }).table;
      if (table === 'people') return list;
      if (table === 'profiles') return profiles;
      return [];
    });

  const uid = () => store.get(settingsState).user_settings.user_local_uid;
  const me = () => store.get(currentPublisherState);

  // the loaders tell the pages through window events
  beforeAll(() => vi.stubGlobal('window', new EventTarget()));
  afterAll(() => vi.unstubAllGlobals());

  test('the linked publisher is "me" on the territory pages', async () => {
    fake([
      { id: 'me', person: 'p2' },
      { id: 'anna', person: 'p1' },
    ]);
    await loadPeople();
    await loadIdentity();
    await loadProfiles();

    expect(store.get(linksState)).toEqual({ me: 'p2', anna: 'p1' });
    expect(store.get(myLinkState)).toEqual({ person: people[1] });
    expect(me()).toBe('Ben Beispiel');
    expect(uid()).toBe('p2');

    // a new device name doesn't undo the link
    await loadIdentity();
    expect(me()).toBe('Ben Beispiel');
  });

  test('unlinked, the device name stands in', async () => {
    fake([{ id: 'me', avatar: null }]);
    await loadPeople();
    await loadIdentity();
    await loadProfiles();

    expect(store.get(myLinkState)).toEqual({});
    expect(me()).toBe('Tom’s phone');
    expect(uid()).toBe('');
  });

  test('a removed publisher shows as missing and falls back', async () => {
    fake([{ id: 'me', person: 'p2' }]);
    await loadIdentity();
    await loadProfiles();
    await loadPeople();
    expect(me()).toBe('Ben Beispiel');

    fake([{ id: 'me', person: 'p2' }], [people[0]]);
    await loadPeople();
    expect(store.get(myLinkState)).toEqual({ missing: true });
    expect(me()).toBe('Tom’s phone');
    expect(uid()).toBe('');
  });

  test('the people are offered on the territory pages, groups first', async () => {
    fake([]);
    await loadPeople();

    expect(store.get(territoryAssigneesState)).toEqual([
      { id: 'g1', name: 'Group 1', group: true },
      { id: 'p1', name: 'Anna Muster', group: false },
      { id: 'p2', name: 'Ben Beispiel', group: false },
    ]);
  });

  test('a group is never a link, and says so', () => {
    expect(linkOf('me', { me: 'g1' }, people)).toEqual({
      missing: true,
      group: true,
    });
  });

  test('unlinked, a publisher named like the device is "me"', async () => {
    fake([], [...people, { id: 'p3', name: 'tom’s  PHONE', group: false }]);
    await loadPeople();
    await loadIdentity();
    await loadProfiles();

    expect(me()).toBe('tom’s  PHONE');
    expect(uid()).toBe('p3');
  });

  test('a double is removed and the devices linked to it move', async () => {
    fake(
      [
        { id: 'me', person: 'p9' },
        { id: 'anna', person: 'p1' },
      ],
      [...people, { id: 'p9', name: 'ben  beispiel', group: false }]
    );
    store.set(myIdState, 'me');
    await loadPeople();

    expect(invoke).toHaveBeenCalledWith('store_write', {
      writes: [
        { table: 'people', id: 'p9', deleted: true },
        { table: 'profiles', id: 'me', fields: { person: 'p2' } },
      ],
    });
    expect(store.get(peopleState).map((person) => person.id)).toEqual([
      'g1',
      'p1',
      'p2',
    ]);
  });

  test('linking and unlinking write this device’s record', async () => {
    fake([]);
    store.set(myIdState, 'me');
    await setLink('p1');
    expect(invoke).toHaveBeenCalledWith('store_write', {
      writes: [{ table: 'profiles', id: 'me', fields: { person: 'p1' } }],
    });
    await setLink(null);
    expect(invoke).toHaveBeenCalledWith('store_write', {
      writes: [{ table: 'profiles', id: 'me', fields: { person: null } }],
    });
  });

  test('a publisher named like the device is suggested', () => {
    expect(suggestedLink('  anna  muster ', people)).toBe(people[0]);
    expect(suggestedLink('Group 1', people)).toBeUndefined();
    expect(suggestedLink('', people)).toBeUndefined();
  });
});

type Write = {
  table: string;
  id: string;
  fields?: Record<string, unknown>;
  deleted?: boolean;
};

// a store as the Rust side keeps it, for load(), and every write sent to it
const fakeStore = (tables: Record<string, Row[]>) => {
  const sent: Write[][] = [];
  const gates: (() => void)[] = [];
  const fake = {
    sent,
    fail: 0,
    // store_list for territories waits for release() while held
    held: false,
    lists: 0,
    release: () => gates.shift()?.(),
  };
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'identity') return { id: 'me', name: 'Tom’s phone' };
    if (command === 'store_write') {
      if (fake.fail > 0) {
        fake.fail -= 1;
        throw new Error('disk full');
      }
      sent.push((args as { writes: Write[] }).writes);
      return 1;
    }
    const table = (args as { table: string }).table;
    if (table === 'territories') {
      fake.lists += 1;
      if (fake.held) await new Promise<void>((done) => gates.push(done));
    }
    return structuredClone(tables[table] ?? []);
  });
  return fake;
};

const settled = () => new Promise((resolve) => setTimeout(resolve));

const edit = (change: (territory: Territory) => Territory) =>
  store.set(territoriesState, (territories) => territories.map(change));

describe('saving', () => {
  const stops: (() => void)[] = [];
  const persisted = () => stops.push(persist());

  beforeAll(() => vi.stubGlobal('window', new EventTarget()));
  afterAll(() => vi.unstubAllGlobals());
  afterEach(() => stops.splice(0).forEach((stop) => stop()));

  const tables = () => ({
    territories: [{ id: 't1', number: '1', holder: 'Ben', daysOut: 3 }],
    assignments: [
      { id: 'a1', territory: 't1', publisher: 'Ben', order: 0 },
      { id: 'a2', territory: 't1', publisher: 'Anna', order: 1 },
    ],
  });

  test('restores false display preferences and saves changes through the same settings records', async () => {
    const fake = fakeStore({
      ...tables(),
      settings: [
        { id: 'show_households', value: false },
        { id: 'show_do_not_call_count', value: false },
        { id: 'overdue_months', value: 6 },
        {
          id: 'recommendations',
          value: { cooldownMonths: 3, categories: ['rural'], types: ['phone'] },
        },
      ],
    });
    await load();
    expect(store.get(territoriesShowHouseholdsState)).toBe(false);
    expect(store.get(territoriesShowDoNotCallCountState)).toBe(false);
    expect(store.get(territoryOverdueMonthsState)).toBe(6);
    expect(store.get(territoryRecommendationsState).cooldownMonths).toBe(3);
    persisted();
    store.set(territoriesShowHouseholdsState, true);
    store.set(territoriesShowDoNotCallCountState, true);
    await settled();
    expect(fake.sent.flat()).toEqual(
      expect.arrayContaining([
        { table: 'settings', id: 'show_households', fields: { value: true } },
        {
          table: 'settings',
          id: 'show_do_not_call_count',
          fields: { value: true },
        },
      ])
    );
  });

  test('only the changed fields are written', async () => {
    const fake = fakeStore(tables());
    await load();
    persisted();

    edit((territory) => ({ ...territory, name: 'Old town' }));
    await settled();
    expect(fake.sent).toEqual([
      [{ table: 'territories', id: 't1', fields: { name: 'Old town' } }],
    ]);

    // the next one moves up: only its order is written
    edit((territory) => ({
      ...territory,
      assignments: territory.assignments.slice(1),
    }));
    await settled();
    expect(fake.sent[1]).toEqual([
      { table: 'assignments', id: 'a2', fields: { order: 0 } },
      { table: 'assignments', id: 'a1', deleted: true },
    ]);
  });

  test('an old group record is read as the group, and only the group is written', async () => {
    const fake = fakeStore({
      territories: [{ id: 't1', number: '1', holder: 'Group 3' }],
      assignments: [
        { id: 'a1', territory: 't1', publisher: 'Group 3', order: 0 },
      ],
      people: [
        { id: 'g3', name: 'Group 3', group: true },
        { id: 'p1', name: 'Max', group: false },
      ],
    });
    await load();
    persisted();
    const [read] = store.get(territoriesState);
    expect(read.holderGroup).toBe('Group 3');
    expect(read.assignments[0]).toMatchObject({
      publisher: '',
      group: 'Group 3',
    });

    // the blank never goes out, so it can't overwrite a name filled in elsewhere
    edit((territory) => ({ ...territory, name: 'Old town' }));
    await settled();
    expect(fake.sent).toEqual([
      [
        {
          table: 'territories',
          id: 't1',
          fields: { name: 'Old town', holderGroup: 'Group 3' },
        },
        { table: 'assignments', id: 'a1', fields: { group: 'Group 3' } },
      ],
    ]);

    edit((territory) => ({
      ...territory,
      assignments: territory.assignments.map((item) => ({
        ...item,
        publisher: 'Max',
      })),
    }));
    await settled();
    expect(fake.sent[1]).toEqual([
      { table: 'assignments', id: 'a1', fields: { publisher: 'Max' } },
    ]);
  });

  test('going back to the territories from before is written too', async () => {
    const fake = fakeStore(tables());
    await load();
    persisted();
    const before = store.get(territoriesState);

    edit((territory) => ({ ...territory, name: 'Old town' }));
    await settled();
    store.set(territoriesState, before);
    await settled();
    expect(fake.sent.at(-1)).toEqual([
      { table: 'territories', id: 't1', fields: { name: null } },
    ]);
  });

  test('a deleted territory put back is written whole, so the store revives it', async () => {
    const fake = fakeStore(tables());
    await load();
    persisted();
    const [deleted] = store.get(territoriesState);

    store.set(territoriesState, []);
    await settled();
    expect(fake.sent[0]).toEqual([
      { table: 'territories', id: 't1', deleted: true },
      { table: 'assignments', id: 'a1', deleted: true },
      { table: 'assignments', id: 'a2', deleted: true },
    ]);

    // whole, as nothing of it is remembered any more; the store revives a
    // deleted record written like this
    restoreTerritory(deleted, 0);
    await settled();
    expect(fake.sent[1]).toEqual(split(deleted));
  });

  test('a cleared field is sent as null, and read back as not there', async () => {
    const fake = fakeStore(tables());
    await load();
    persisted();

    // returned: no holder, and no days out
    edit((territory) => {
      const next = { ...territory, holder: undefined };
      delete next.daysOut;
      return next;
    });
    await settled();
    expect(fake.sent).toEqual([
      [
        {
          table: 'territories',
          id: 't1',
          fields: { holder: null, daysOut: null },
        },
      ],
    ]);

    fakeStore({ territories: [{ id: 't1', number: '1', holder: null }] });
    await load();
    expect(store.get(territoriesState)[0]).not.toHaveProperty('holder');
  });

  test('a failed write is retried', async () => {
    const fake = fakeStore(tables());
    await load();
    persisted();

    fake.fail = 1;
    edit((territory) => ({ ...territory, name: 'Old town' }));
    await settled();
    expect(fake.sent).toEqual([]);
    expect(notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'error'
    );

    // a load in between keeps it, and writes it
    await load();
    await settled();
    expect(store.get(territoriesState)[0].name).toBe('Old town');
    expect(fake.sent).toEqual([
      [{ table: 'territories', id: 't1', fields: { name: 'Old town' } }],
    ]);

    fake.fail = 1;
    edit((territory) => ({ ...territory, city: 'Xanten' }));
    await settled();
    // the next change takes the failed one along
    edit((territory) => ({ ...territory, name: 'Harbour' }));
    await settled();
    expect(fake.sent.at(-1)).toEqual([
      {
        table: 'territories',
        id: 't1',
        fields: { city: 'Xanten', name: 'Harbour' },
      },
    ]);
  });

  test('a failed write is tried again by itself, later each time', async () => {
    const fake = fakeStore(tables());
    await load();
    persisted();
    vi.useFakeTimers();
    try {
      fake.fail = 2;
      edit((territory) => ({ ...territory, name: 'Old town' }));
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(2000);
      expect(fake.sent).toEqual([]);
      await vi.advanceTimersByTimeAsync(4000);
      expect(fake.sent).toEqual([]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(fake.sent).toEqual([
        [{ table: 'territories', id: 't1', fields: { name: 'Old town' } }],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test('an edit during a load is kept', async () => {
    const data = tables();
    const fake = fakeStore(data);
    await load();
    persisted();

    // a sync brought a new city meanwhile
    data.territories[0] = { ...data.territories[0], city: 'Wesel' } as never;
    fake.held = true;
    const loading = load();
    await settled();
    edit((territory) => ({ ...territory, name: 'Old town' }));
    fake.release();
    await loading;
    await settled();

    const [territory] = store.get(territoriesState);
    expect(territory.name).toBe('Old town');
    expect(territory.city).toBe('Wesel');
    expect(fake.sent).toEqual([
      [{ table: 'territories', id: 't1', fields: { name: 'Old town' } }],
    ]);
  });

  test('overlapping loads run in sequence, a burst as one', async () => {
    const fake = fakeStore(tables());
    await load();
    persisted();
    const changed = vi.mocked(listen).mock.calls.at(-1)![1] as () => void;
    fake.lists = 0;
    fake.held = true;

    const first = load();
    await settled();
    expect(fake.lists).toBe(1);

    // a sync tells three times while the first load runs
    changed();
    changed();
    const next = load();
    await settled();
    expect(fake.lists).toBe(1);

    fake.release();
    await first;
    await settled();
    expect(fake.lists).toBe(2);
    fake.release();
    await next;
    await settled();
    expect(fake.lists).toBe(2);
  });

  test('stopped, the pages write nothing', async () => {
    const fake = fakeStore(tables());
    await load();
    persist()();

    edit((territory) => ({ ...territory, name: 'Old town' }));
    await settled();
    expect(fake.sent).toEqual([]);
  });

  test('the special campaigns are one setting, loaded and written', async () => {
    const memorial = {
      id: 'c1',
      name: 'Memorial invitations',
      start: '2026-03-01',
      end: '2026-03-21',
    };
    const fake = fakeStore({
      ...tables(),
      settings: [{ id: 'campaigns', value: [memorial] }],
    });
    await load();
    persisted();
    expect(store.get(territoryCampaignsState)).toEqual([memorial]);

    const carts = {
      id: 'c2',
      name: 'Carts',
      start: '2026-05-01',
      end: '2026-05-31',
    };
    store.set(territoryCampaignsState, [memorial, carts]);
    await settled();
    expect(fake.sent).toEqual([
      [
        {
          table: 'settings',
          id: 'campaigns',
          fields: { value: [memorial, carts] },
        },
      ],
    ]);

    // a phone without the setting has no campaigns
    fakeStore(tables());
    await load();
    expect(store.get(territoryCampaignsState)).toEqual([]);
  });
});

describe('renaming', () => {
  beforeAll(() => vi.stubGlobal('window', new EventTarget()));
  afterAll(() => vi.unstubAllGlobals());

  test('a new name reaches the territories and is written', async () => {
    const fake = fakeStore({
      territories: [
        { id: 't1', number: '1', holder: 'Ben' },
        { id: 't2', number: '2', requestedBy: 'Ben' },
        { id: 't3', number: '3', holder: 'Anna' },
      ],
      assignments: [{ id: 'a1', territory: 't1', publisher: 'Ben', order: 0 }],
      do_not_calls: [{ id: 'd1', territory: 't1', addedBy: 'Ben', order: 0 }],
    });
    await load();
    const stop = persist();

    renameOnTerritories(new Map([['Ben', 'Ben Beispiel']]));

    const [t1, t2, t3] = store.get(territoriesState);
    expect(t1.holder).toBe('Ben Beispiel');
    expect(t1.assignments[0].publisher).toBe('Ben Beispiel');
    expect(t1.doNotCalls[0].addedBy).toBe('Ben Beispiel');
    expect(t2.requestedBy).toBe('Ben Beispiel');
    expect(t3.holder).toBe('Anna');

    await settled();
    stop();
    expect(fake.sent).toEqual([
      [
        { table: 'territories', id: 't1', fields: { holder: 'Ben Beispiel' } },
        {
          table: 'assignments',
          id: 'a1',
          fields: { publisher: 'Ben Beispiel' },
        },
        {
          table: 'do_not_calls',
          id: 'd1',
          fields: { addedBy: 'Ben Beispiel' },
        },
        {
          table: 'territories',
          id: 't2',
          fields: { requestedBy: 'Ben Beispiel' },
        },
      ],
    ]);
  });
});

describe('territory numbers', () => {
  test('lose the zero before a single digit', () => {
    expect(unpadded('M01')).toBe('M1');
    expect(unpadded('N09')).toBe('N9');
    expect(unpadded('7')).toBe('7');
    expect(unpadded('07')).toBe('7');
    expect(unpadded('M10')).toBe('M10');
    expect(unpadded('M100')).toBe('M100');
    expect(unpadded('M0')).toBe('M0');
    expect(unpadded('Nord 03')).toBe('Nord 3');
  });
});

test('overdue preference updates derived territory status without rewriting history', () => {
  const state = createStore();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 3, 12));
  try {
    const record = territory({
      id: 'overdue-test',
      number: '1',
      status: 'available',
      assignments: [
        { id: 'assignment', publisher: 'Alex', assignedOn: '01.05.2026' },
      ],
    });
    state.set(territoriesState, [record]);
    state.set(territoryCampaignsState, []);
    state.set(territoryOverdueMonthsState, 4);
    expect(state.get(territoriesWithStatusState)[0].status).toBe('overdue');
    state.set(territoryOverdueMonthsState, 6);
    expect(state.get(territoriesWithStatusState)[0].status).toBe('in_work');
    expect(state.get(territoriesState)[0]).toBe(record);
    expect(state.get(territoriesWithStatusState)[0].assignments).toEqual(
      record.assignments
    );
  } finally {
    vi.useRealTimers();
  }
});
