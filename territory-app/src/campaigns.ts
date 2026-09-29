import { atom } from 'jotai';
import { TerritoryCampaign } from '@definition/territory';
import { UpcomingEventCategory } from '@definition/upcoming_events';
import { dayOf } from '@features/territories/campaign_dates';
import { tx } from '@services/i18n/translation';

// Stands in for the main app's Special campaign events: the campaigns
// entered in this app's settings, kept in the store as one setting and
// synced with the paired devices.

export const territoryCampaignsState = atom<TerritoryCampaign[]>([]);

type BackupEvent = {
  event_uid: string;
  event_data: {
    _deleted?: boolean;
    category: number;
    start: string;
    end: string;
    description?: string;
  };
};

/** The Special campaign events in an Organized backup, as campaigns. */
export const campaignsFromBackup = (events: unknown): TerritoryCampaign[] =>
  (Array.isArray(events) ? (events as BackupEvent[]) : [])
    .filter(
      ({ event_data }) =>
        event_data?.category === UpcomingEventCategory.SpecialCampaignWeek &&
        !event_data._deleted
    )
    .map(({ event_uid, event_data }) => ({
      id: event_uid,
      name: event_data.description?.trim() || tx('Special campaign'),
      start: dayOf(new Date(event_data.start)),
      end: dayOf(new Date(event_data.end)),
    }));

/** The campaigns this phone doesn't have yet, by id. */
export const newCampaigns = (
  existing: TerritoryCampaign[],
  incoming: TerritoryCampaign[]
) => {
  const ids = new Set(existing.map((campaign) => campaign.id));

  return incoming.filter((campaign) => !ids.has(campaign.id));
};
