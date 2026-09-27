import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { Territory } from '@definition/territory';
import { store } from '@states/index';
import { appLocalsState } from '@states/app_locals';
import { settingsState } from '@states/settings';
import { territoriesState } from '@states/territories';
import { CURRENT_PUBLISHER } from './data';
import { invoke } from './native';
import {
  assemble,
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
  listen: vi.fn(),
  nearby: vi.fn(),
}));
vi.mock('./seed', () => ({}));

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
    expect(CURRENT_PUBLISHER).toBe('Ben Beispiel');
    expect(uid()).toBe('p2');

    // a new device name doesn't undo the link
    await loadIdentity();
    expect(CURRENT_PUBLISHER).toBe('Ben Beispiel');
  });

  test('unlinked, the device name stands in', async () => {
    fake([{ id: 'me', avatar: null }]);
    await loadPeople();
    await loadIdentity();
    await loadProfiles();

    expect(store.get(myLinkState)).toEqual({});
    expect(CURRENT_PUBLISHER).toBe('Tom’s phone');
    expect(uid()).toBe('');
  });

  test('a removed publisher shows as missing and falls back', async () => {
    fake([{ id: 'me', person: 'p2' }]);
    await loadIdentity();
    await loadProfiles();
    await loadPeople();
    expect(CURRENT_PUBLISHER).toBe('Ben Beispiel');

    fake([{ id: 'me', person: 'p2' }], [people[0]]);
    await loadPeople();
    expect(store.get(myLinkState)).toEqual({ missing: true });
    expect(CURRENT_PUBLISHER).toBe('Tom’s phone');
    expect(uid()).toBe('');
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

    expect(CURRENT_PUBLISHER).toBe('tom’s  PHONE');
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

describe('renaming', () => {
  test('a new name reaches the territories and is written', async () => {
    vi.mocked(invoke).mockResolvedValue(1);
    store.set(territoriesState, [
      territory({
        id: 't1',
        number: '1',
        holder: 'Ben',
        assignments: [{ id: 'a1', publisher: 'Ben' }],
        doNotCalls: [{ id: 'd1', addedBy: 'Ben' }],
      }),
      territory({ id: 't2', number: '2', requestedBy: 'Ben' }),
      territory({ id: 't3', number: '3', holder: 'Anna' }),
    ]);
    persist();
    vi.mocked(invoke).mockClear();

    renameOnTerritories(new Map([['Ben', 'Ben Beispiel']]));

    const [t1, t2, t3] = store.get(territoriesState);
    expect(t1.holder).toBe('Ben Beispiel');
    expect(t1.assignments[0].publisher).toBe('Ben Beispiel');
    expect(t1.doNotCalls[0].addedBy).toBe('Ben Beispiel');
    expect(t2.requestedBy).toBe('Ben Beispiel');
    expect(t3.holder).toBe('Anna');

    const { writes } = vi.mocked(invoke).mock.calls[0][1] as {
      writes: { table: string; id: string }[];
    };
    expect(writes.map((write) => `${write.table}/${write.id}`)).toEqual([
      'territories/t1',
      'assignments/a1',
      'do_not_calls/d1',
      'territories/t2',
    ]);
  });
});
