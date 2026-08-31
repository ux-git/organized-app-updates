import { can } from '../capabilities';

export type NotificationAction = {
  id: string;
  title: string;
  /** Renders the button in the platform's destructive style (iOS). */
  destructive?: boolean;
  /** Turns the button into an inline reply field. */
  input?: boolean;
};

export type NotificationActionType = {
  id: string;
  actions: NotificationAction[];
};

export type LocalNotification = {
  title: string;
  body: string;
  /** Ties the notification to a registered action type (mobile only). */
  actionTypeId?: string;
  /** Android channel the notification belongs to. */
  channelId?: string;
  /** Fire at a future moment instead of immediately. */
  at?: Date;
  /** Carried back to the app when the notification or an action is tapped. */
  extra?: Record<string, unknown>;
};

/** Asks for notification permission, returning whether it is now granted. */
export const ensurePermission = async (): Promise<boolean> => {
  if (!can('notification-actions')) {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    return (await Notification.requestPermission()) === 'granted';
  }

  const { isPermissionGranted, requestPermission } = await import(
    '@tauri-apps/plugin-notification'
  );

  if (await isPermissionGranted()) return true;

  return (await requestPermission()) === 'granted';
};

/**
 * Declares the action-button sets the app can attach to notifications. Must
 * run before any notification referencing them is sent — iOS resolves
 * categories at delivery time and silently drops unknown ones.
 */
export const registerActionTypes = async (types: NotificationActionType[]) => {
  if (!can('notification-actions')) return;

  const { registerActionTypes: register } = await import(
    '@tauri-apps/plugin-notification'
  );

  await register(
    types.map((type) => ({
      id: type.id,
      actions: type.actions.map((action) => ({
        id: action.id,
        title: action.title,
        destructive: action.destructive,
        input: action.input,
      })),
    }))
  );
};

/**
 * Creates an Android notification channel. Channels are immutable once
 * created, so changing importance later needs a new channel id.
 */
export const ensureChannel = async (channel: {
  id: string;
  name: string;
  description?: string;
}) => {
  if (!can('notification-actions')) return;

  const { createChannel, channels, Importance, Visibility } = await import(
    '@tauri-apps/plugin-notification'
  );

  const existing = await channels();
  if (existing.some((item) => item.id === channel.id)) return;

  await createChannel({
    id: channel.id,
    name: channel.name,
    description: channel.description,
    importance: Importance.Default,
    visibility: Visibility.Private,
  });
};

export const showNotification = async (notification: LocalNotification) => {
  if (!(await ensurePermission())) return;

  if (!can('notification-actions')) {
    // Action buttons need a service worker registration on the web; a plain
    // notification is the honest fallback.
    new Notification(notification.title, { body: notification.body });
    return;
  }

  const { sendNotification, Schedule } = await import(
    '@tauri-apps/plugin-notification'
  );

  sendNotification({
    title: notification.title,
    body: notification.body,
    actionTypeId: notification.actionTypeId,
    channelId: notification.channelId,
    extra: notification.extra,
    schedule: notification.at ? Schedule.at(notification.at) : undefined,
  });
};

/** Subscribes to action-button taps. Returns an unsubscribe function. */
export const onNotificationAction = async (
  handler: (payload: { actionId: string; extra?: Record<string, unknown> }) => void
): Promise<() => void> => {
  if (!can('notification-actions')) return () => {};

  const { onAction } = await import('@tauri-apps/plugin-notification');

  const listener = await onAction((notification) => {
    handler({
      actionId: notification.actionTypeId ?? '',
      extra: notification.extra as Record<string, unknown> | undefined,
    });
  });

  return () => {
    listener.unregister();
  };
};
