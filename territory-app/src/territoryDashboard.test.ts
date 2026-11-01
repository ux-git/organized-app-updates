import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider, createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import type { Territory, TerritoryAssignment } from '@definition/territory';
import type { TerritoryAccessContext } from '@definition/territory_access';
import { withAssignments } from '@utils/territory_dates';
import { forTab } from '@features/territories/tabs';

const access = vi.hoisted(() => ({ current: {} as TerritoryAccessContext }));
vi.mock('@features/territories/useTerritoryAccess', () => ({
  default: () => access.current,
}));
vi.mock('@states/territories', async () => {
  const { atom } = await import('jotai');
  const { withAssignments } = await import('@utils/territory_dates');
  const territoriesState = atom<Territory[]>([]);
  return {
    territoriesState,
    territoriesWithStatusState: atom((get) =>
      get(territoriesState).map((item) =>
        withAssignments(item, item.assignments)
      )
    ),
    territoryRecommendationsState: atom({
      categories: [],
      types: [],
      cooldownMonths: 0,
    }),
  };
});
import { territoriesState } from '@states/territories';
import useTerritoryTabList from '@features/territories/useTerritoryTabList';

const assignment = (index: number, identity?: string): TerritoryAssignment => ({
  id: `assignment-${index}`,
  publisher: 'Bastian',
  publisherId: identity,
  assignedOn: '01.10.2026',
  serviceYear: 2027,
  months: 1,
  startMonth: 1,
  endMonth: 1,
});
const records = (identity: string): Territory[] =>
  Array.from({ length: 8 }, (_, index) => ({
    id: String(index),
    number: String(index),
    name: '',
    city: '',
    type: 'door_to_door',
    status: 'in_work',
    categories: [],
    households: 0,
    cardLost: false,
    daysSinceCovered: 0,
    doNotCalls: [],
    holder: index === 7 ? 'Previous holder' : 'Bastian',
    assignments: [assignment(index, index === 7 ? identity : undefined)],
  }));
const read = (store: ReturnType<typeof createStore>) => {
  let result: ReturnType<typeof useTerritoryTabList>;
  const Probe = () => {
    result = useTerritoryTabList();
    return null;
  };
  renderToStaticMarkup(
    createElement(Provider, { store }, createElement(Probe))
  );
  return result!;
};

for (const mode of ['local', 'online']) {
  describe(`${mode} territory dashboard and list`, () => {
    const identity = `${mode}-publisher`;
    const setup = () => {
      access.current = {
        editor: true,
        publisher: 'Bastian',
        publisherId: identity,
        legacyIdentitySafe: true,
        eligiblePublisher: true,
        access: 'request',
        restricted: { categories: [], types: [] },
      };
      const store = createStore();
      store.set(territoriesState, records(identity));
      return store;
    };
    it('reproduces 7 vs 8 and selects all eight from current assignments and stable identity', () => {
      const store = setup();
      const raw = store.get(territoriesState);
      expect(forTab(raw, 'mine', 'Bastian')).toHaveLength(7);
      const selected = read(store);
      const list = forTab(
        raw.map((item) => withAssignments(item, item.assignments)),
        'mine',
        'Bastian',
        true,
        undefined,
        access.current.restricted,
        { identity: access.current }
      );
      expect(selected.selectTab('mine')).toEqual(list);
      expect(selected.selectTab('mine')).toHaveLength(8);
    });
    it('updates the count after a return and a reassignment', () => {
      const store = setup();
      store.set(territoriesState, (items) =>
        items.map((item, index) =>
          index === 7
            ? {
                ...item,
                assignments: [
                  { ...item.assignments[0], returnedOn: '02.10.2026' },
                ],
              }
            : item
        )
      );
      expect(read(store).selectTab('mine')).toHaveLength(7);
      store.set(territoriesState, (items) =>
        items.map((item, index) =>
          index === 6
            ? {
                ...item,
                assignments: [
                  {
                    ...item.assignments[0],
                    publisher: 'Another publisher',
                    publisherId: 'other',
                  },
                ],
              }
            : item
        )
      );
      expect(read(store).selectTab('mine')).toHaveLength(6);
    });
    it('applies publisher restrictions and identifies renamed holders by ID', () => {
      const store = setup();
      access.current = {
        ...access.current,
        editor: false,
        publisher: 'Renamed publisher',
        legacyIdentitySafe: false,
        restricted: { categories: ['private'], types: [] },
      };
      store.set(territoriesState, (items) => [
        ...items,
        {
          ...items[0],
          id: 'available',
          assignments: [],
          holder: undefined,
          status: 'available',
        },
        {
          ...items[0],
          id: 'private',
          assignments: [],
          holder: undefined,
          status: 'available',
          categories: ['private'],
        },
      ]);
      const view = read(store);
      expect(view.selectTab('mine').map((item) => item.id)).toEqual(['7']);
      expect(view.selectTab('all').map((item) => item.id)).toEqual([
        'available',
      ]);
      expect(view.selectTab('recommended').map((item) => item.id)).toEqual([
        'available',
      ]);
    });
  });
}
