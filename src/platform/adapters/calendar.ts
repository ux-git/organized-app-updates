import { createEvent, DateArray, EventAttributes } from 'ics';
import { saveFile } from './files';

export type CalendarEvent = {
  uid: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  /** All-day events carry no time component and end on the following day. */
  allDay: boolean;
};

const asDateArray = (date: Date, allDay: boolean): DateArray =>
  allDay
    ? [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    : [
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
      ];

const buildICS = (event: CalendarEvent): Promise<string> => {
  const end = event.allDay
    ? new Date(
        event.end.getFullYear(),
        event.end.getMonth(),
        event.end.getDate() + 1
      )
    : event.end;

  const attributes: EventAttributes = {
    title: event.title,
    description: event.description,
    start: asDateArray(event.start, event.allDay),
    end: asDateArray(end, event.allDay),
  };

  return new Promise((resolve, reject) => {
    createEvent(attributes, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
};

/**
 * Puts an event in the user's calendar.
 *
 * Both hosts go through an .ics file today: the browser downloads it, and the
 * native shell writes it out and lets the OS offer the calendar apps that can
 * import it. Writing straight into the calendar store (EventKit on iOS,
 * `ACTION_INSERT` on Android) needs a custom plugin — when that lands it
 * replaces the body of this function and nothing else.
 */
export const addToCalendar = async (event: CalendarEvent) => {
  const ics = await buildICS(event);

  await saveFile(new Blob([ics], { type: 'text/calendar' }), `${event.uid}.ics`);
};
