import formTranslations from '@locales/en/forms-templates.json';
import importExample from './publisher-import-example.json';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { store } from '@states/index';
import { campaignsFromBackup, territoryCampaignsState } from './campaigns';
import { applyImport, planImport, readBackup } from './people';
import { writeRows } from './persistence';

vi.mock('@services/i18n/translation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/i18n/translation')>()),
  getTranslation: ({ key }: { key: string }) =>
    formTranslations[key as keyof typeof formTranslations] ?? key,
}));

vi.mock('./native', () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  nearby: vi.fn(),
}));
vi.mock('./persistence', () => ({
  PEOPLE: 'people',
  writeRows: vi.fn(async () => 1),
  loadPeople: vi.fn(async () => []),
  renameOnTerritories: vi.fn(),
}));

// Organized's UpcomingEventCategory: SpecialCampaignWeek is 6
const event = (
  uid: string,
  category: number,
  description = '',
  deleted = false
) => ({
  event_uid: uid,
  event_data: {
    _deleted: deleted,
    category,
    start: '2026-03-01T08:00:00.000Z',
    end: '2026-03-21T09:00:00.000Z',
    description,
    type: 'main',
  },
});

const memorial = event('e1', 6, ' Memorial invitations ');

describe('campaigns from a backup', () => {
  test('takes the Special campaign events, by their local days', () => {
    expect(
      campaignsFromBackup([
        memorial,
        event('e2', 2, 'Memorial'),
        event('e3', 6, 'Old', true),
      ])
    ).toEqual([
      {
        id: 'e1',
        name: 'Memorial invitations',
        description: 'Memorial invitations',
        start: '2026-03-01',
        end: '2026-03-21',
      },
    ]);
  });

  test('an event without a description is named after its kind', () => {
    expect(campaignsFromBackup([event('e4', 6)])[0].name).toBe(
      'Special campaign'
    );
  });

  test('keeps the campaign title separate from its instructions', () => {
    const named = event('named', 6, 'Visit the east side first.');
    expect(
      campaignsFromBackup([
        {
          ...named,
          event_data: { ...named.event_data, custom: 'Autumn invitation' },
        },
      ])[0]
    ).toMatchObject({
      name: 'Autumn invitation',
      description: 'Visit the east side first.',
    });
  });

  test('ignores campaigns with invalid dates instead of exposing broken ranges', () => {
    const invalid = event('invalid', 6);
    invalid.event_data.start = 'not a date';
    expect(campaignsFromBackup([invalid])).toEqual([]);
  });

  test('a backup without events has none', () => {
    expect(campaignsFromBackup(undefined)).toEqual([]);
  });
});

describe('importing a backup', () => {
  const backup = JSON.stringify({
    data: { persons: [], upcoming_events: [memorial, event('e5', 6, 'Carts')] },
  });

  beforeEach(() => {
    store.set(territoryCampaignsState, []);
    vi.mocked(writeRows).mockClear();
  });

  test('plans the campaigns this phone does not have yet', () => {
    store.set(territoryCampaignsState, [
      { id: 'e1', name: 'Renamed', start: '2026-03-01', end: '2026-03-21' },
    ]);
    const { incoming, skipped, campaigns } = readBackup(backup);
    const plan = planImport([], incoming, skipped, campaigns);

    expect(campaigns.map((campaign) => campaign.id)).toEqual(['e1', 'e5']);
    expect(plan.campaigns.map((campaign) => campaign.id)).toEqual(['e5']);
  });

  test('adds the planned campaigns to the ones kept', async () => {
    const { incoming, skipped, campaigns } = readBackup(backup);
    await applyImport(planImport([], incoming, skipped, campaigns), false);

    expect(store.get(territoryCampaignsState).map((c) => c.name)).toEqual([
      'Memorial invitations',
      'Carts',
    ]);
    // people only; the campaigns setting is written by persistence
    expect(writeRows).toHaveBeenCalledWith([]);
  });

  test('a pasted list brings no campaigns', () => {
    expect(planImport([], []).campaigns).toEqual([]);
  });
});

test('downloadable publisher example imports names and a group', () => {
  const result = readBackup(JSON.stringify(importExample));
  expect(result.skipped).toBe(0);
  expect(result.incoming.map((person) => [person.name, person.group])).toEqual([
    ['Alex Example', false],
    ['Sam Sample', false],
    ['Group 1 – Example', true],
  ]);
  const plan = planImport([], result.incoming);
  expect(plan.add).toHaveLength(3);
  expect(planImport(plan.add, result.incoming).add).toHaveLength(0);
});
