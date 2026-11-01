import appDb from '@db/appDb';
import {
  DEFAULT_EVENT_START_HOUR,
  UpcomingEventCategory,
  UpcomingEventDuration,
  UpcomingEventType,
} from '@definition/upcoming_events';
import { addDays } from '@utils/date';
import { localStorageGetItem } from '@utils/common';

const dbUpdateUpcomingEventMetadata = async () => {
  const metadata = await appDb.metadata.get(1);

  if (!metadata) return;

  metadata.metadata.upcoming_events = {
    ...metadata.metadata.upcoming_events,
    send_local: true,
  };

  await appDb.metadata.put(metadata);
};

export const dbUpcomingEventGetAll = async () => {
  const events = appDb.upcoming_events.toArray();
  return events;
};

export const dbUpcomingEventsGetActive = async () => {
  const events = await appDb.upcoming_events
    .filter((record) => !record.event_data._deleted)
    .toArray();

  return events;
};

export const dbUpcomingEventsBulkSave = async (events: UpcomingEventType[]) => {
  await appDb.upcoming_events.bulkPut(events);
  await dbUpdateUpcomingEventMetadata();
};

export const dbUpcomingEventsSave = async (event: UpcomingEventType) => {
  await appDb.upcoming_events.put(event);
  await dbUpdateUpcomingEventMetadata();
};

// test mode: a Special campaign under way, so a territory can be filed under it
export const dbUpcomingEventsDummy = async () => {
  const start = addDays(new Date(), -7);
  start.setHours(DEFAULT_EVENT_START_HOUR, 0, 0, 0);
  const end = addDays(new Date(), 14);
  end.setHours(DEFAULT_EVENT_START_HOUR + 1, 0, 0, 0);

  await dbUpcomingEventsSave({
    event_uid: crypto.randomUUID(),
    event_data: {
      _deleted: false,
      updatedAt: new Date().toISOString(),
      start: start.toISOString(),
      end: end.toISOString(),
      type: 'main',
      category: UpcomingEventCategory.SpecialCampaignWeek,
      duration: UpcomingEventDuration.MultipleDays,
      description:
        localStorageGetItem('ui_lang') === 'deu'
          ? 'Gedächtnismahl-Einladungen'
          : 'Memorial invitations',
      custom: '',
      wholeDay: true,
    },
  });
};

export const dbUpcomingEventsClear = async () => {
  const records = await appDb.upcoming_events.toArray();

  if (records.length === 0) return;

  for (const record of records) {
    record.event_data._deleted = true;
    record.event_data.updatedAt = new Date().toISOString();
  }

  await appDb.upcoming_events.bulkPut(records);
};

export const dbUpcomingEventsCleanup = async () => {
  const records = await appDb.upcoming_events.toArray();

  if (records.length === 0) return;

  const recordsToUpdate = records.reduce(
    (acc: UpcomingEventType[], current) => {
      if (current.updatedAt) {
        const event = structuredClone(current);

        event.event_data._deleted = event._deleted;
        event.event_data.updatedAt = event.updatedAt;

        delete event._deleted;
        delete event.updatedAt;

        acc.push(event);
      }

      return acc;
    },
    []
  );

  if (recordsToUpdate.length > 0) {
    await appDb.upcoming_events.bulkPut(recordsToUpdate);
  }
};

export const dbUpcomingEventGet = (id: string) => appDb.upcoming_events.get(id);
