import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ReminderItemProps } from './index.types';
import { addDays, formatDate } from '@utils/date';
import { can } from '@platform/index';
import {
  ensureChannel,
  onNotificationAction,
  registerActionTypes,
  showNotification,
} from '@platform/adapters/notify';
import { useAppTranslation } from '@hooks/index';

const CHANNEL_ID = 'reminders';
const ACTION_TYPE_ID = 'reminder';
const ACTION_SNOOZE = 'remind-tomorrow';

/** Marks the day a reminder notification was last posted, to post it once. */
const POSTED_KEY = 'organized_reminder_notified';

type Params = {
  reminders: ReminderItemProps[];
  onSnooze: VoidFunction;
};

/**
 * Mirrors the in-app reminder card as a system notification on native hosts.
 *
 * The card already covers the case where the user is looking at the app, so a
 * notification is only posted while the app is in the background — that is the
 * only moment it tells the user something the card cannot.
 */
const useReminderNotifications = ({ reminders, onSnooze }: Params) => {
  const { t } = useAppTranslation();
  const navigate = useNavigate();

  const remindersRef = useRef(reminders);
  remindersRef.current = reminders;

  const snoozeRef = useRef(onSnooze);
  snoozeRef.current = onSnooze;

  // register the channel and the buttons once per session, before anything
  // referencing them can be sent
  useEffect(() => {
    if (!can('notification-actions')) return;

    const setup = async () => {
      await ensureChannel({
        id: CHANNEL_ID,
        name: t('tr_reminders'),
      });

      await registerActionTypes([
        {
          id: ACTION_TYPE_ID,
          actions: [
            { id: 'open', title: t('tr_reminderOpen') },
            { id: ACTION_SNOOZE, title: t('tr_remindMeTomorrow') },
          ],
        },
      ]);
    };

    setup().catch(() => {
      // notifications are an enhancement; a host that refuses them keeps the
      // in-app card
    });
  }, [t]);

  // act on a button tap, which may arrive while the app is starting up
  useEffect(() => {
    if (!can('notification-actions')) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    onNotificationAction(({ actionId, extra }) => {
      if (actionId === ACTION_SNOOZE) {
        snoozeRef.current();
        return;
      }

      const path = typeof extra?.path === 'string' ? extra.path : undefined;
      if (path) navigate(path);
    })
      .then((off) => {
        if (cancelled) off();
        else unsubscribe = off;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [navigate]);

  // post the notification when the app is not the thing the user is looking at
  useEffect(() => {
    if (!can('notification-actions')) return;
    if (reminders.length === 0) return;

    const post = () => {
      if (document.visibilityState === 'visible') return;

      const today = formatDate(new Date(), 'yyyy/MM/dd');
      if (localStorage.getItem(POSTED_KEY) === today) return;

      const reminder = remindersRef.current.at(0);
      if (!reminder) return;

      localStorage.setItem(POSTED_KEY, today);

      showNotification({
        title: reminder.title,
        body: reminder.description,
        channelId: CHANNEL_ID,
        actionTypeId: ACTION_TYPE_ID,
        extra: { path: reminder.path },
      }).catch(() => {});
    };

    document.addEventListener('visibilitychange', post);

    return () => {
      document.removeEventListener('visibilitychange', post);
    };
  }, [reminders]);
};

export default useReminderNotifications;

/** Clears the once-a-day marker so a snoozed reminder can notify again. */
export const resetReminderNotification = () => {
  const tomorrow = addDays(new Date(), 1);
  localStorage.setItem(POSTED_KEY, formatDate(tomorrow, 'yyyy/MM/dd'));
};
