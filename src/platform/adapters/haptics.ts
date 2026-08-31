import { can } from '../capabilities';

type Impact = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';

/**
 * Short tactile tick for discrete UI changes — toggles, checkboxes, selection.
 * No-op on hosts without haptics; never throws, never blocks the caller.
 */
export const impact = async (style: Impact = 'light') => {
  if (!can('haptics')) return;

  try {
    const { impactFeedback } = await import('@tauri-apps/plugin-haptics');
    await impactFeedback(style);
  } catch {
    // Plugin missing or refused by the OS — a plain vibration is a better
    // degradation than nothing, and is itself optional.
    try {
      navigator.vibrate?.(10);
    } catch {
      /* unsupported */
    }
  }
};

/** Feedback for a completed or failed operation. */
export const notify = async (type: 'success' | 'warning' | 'error') => {
  if (!can('haptics')) return;

  try {
    const { notificationFeedback } = await import('@tauri-apps/plugin-haptics');
    await notificationFeedback(type);
  } catch {
    /* unsupported */
  }
};
