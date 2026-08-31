import { useState } from 'react';
import { AddToCalendarProps } from './index.types';
import {
  UpcomingEventCategory,
  UpcomingEventDuration,
} from '@definition/upcoming_events';
import { useAppTranslation } from '@hooks/index';
import { decorationsForEvent } from '../decorations_for_event';
import { displaySnackNotification } from '@services/states/app';
import { getMessageByCode } from '@services/i18n/translation';
import { addToCalendar } from '@platform/adapters/calendar';

const useAddToCalendar = ({ event }: AddToCalendarProps) => {
  const { t } = useAppTranslation();
  const [isProcessing, setIsProcessing] = useState(false);

  const eventDecoration =
    event.event_data.category !== undefined &&
    event.event_data.category < decorationsForEvent.length
      ? decorationsForEvent[event.event_data.category]
      : decorationsForEvent[decorationsForEvent.length - 1];

  const handleAddToCalendar = async () => {
    if (isProcessing) return;

    setIsProcessing(true);

    // a custom event with no label still needs a name in the calendar
    const eventTitle =
      event.event_data.category !== UpcomingEventCategory.Custom
        ? t(eventDecoration.translationKey)
        : (event.event_data.custom ?? t(eventDecoration.translationKey));

    try {
      await addToCalendar({
        uid: event.event_uid,
        title: eventTitle,
        description: event.event_data.description,
        start: new Date(event.event_data.start),
        end: new Date(event.event_data.end),
        allDay: event.event_data.duration !== UpcomingEventDuration.SingleDay,
      });
    } catch (error) {
      console.error(error);

      displaySnackNotification({
        header: getMessageByCode('error_app_generic-title'),
        message: getMessageByCode((error as Error).message),
        severity: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    isProcessing,
    handleAddToCalendar,
  };
};

export default useAddToCalendar;
