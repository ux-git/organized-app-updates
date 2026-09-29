import { atom } from 'jotai';
import { UpcomingEventCategory } from '@definition/upcoming_events';
import { TerritoryCampaign } from '@definition/territory';
import { upcomingEventsState } from '@states/upcoming_events';
import { fieldServiceGroupsState } from '@states/field_service_groups';
import { tx } from '@services/i18n/translation';
import { dayOf } from './campaign_dates';

// The Special campaign events on the Termine page are the campaigns a
// territory can be worked for. The territory app swaps this module for its
// own list, kept in its settings.

export const territoryCampaignsState = atom<TerritoryCampaign[]>((get) => {
  const groups = get(fieldServiceGroupsState);

  return get(upcomingEventsState)
    .filter(
      (event) =>
        event.event_data.category === UpcomingEventCategory.SpecialCampaignWeek
    )
    .map(({ event_uid, event_data }) => {
      const group =
        event_data.type !== 'main'
          ? groups.find((record) => record.group_id === event_data.type)
              ?.group_data.name
          : undefined;

      return {
        id: event_uid,
        name: event_data.description?.trim() || tx('Special campaign'),
        start: dayOf(new Date(event_data.start)),
        end: dayOf(new Date(event_data.end)),
        ...(group ? { group } : {}),
      };
    });
});
