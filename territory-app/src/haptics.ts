import { WebHaptics } from 'web-haptics';
import { store } from '@states/index';
import { hapticsEnabledState } from '@states/settings';
import { HAPTIC_PATTERNS, type HapticIntent } from '@services/haptics/patterns';

export type { HapticIntent } from '@services/haptics/patterns';

declare global {
  interface Window {
    OrganizedHaptics?: { perform: (intent: string) => boolean };
  }
}

// Android's own effects follow the system's touch feedback setting and need
// no vibration permission; the web patterns are the fallback.
const NATIVE: Record<HapticIntent, string> = {
  tap: 'tap',
  limit: 'reject',
  reset: 'toggleOff',
  celebrate: 'confirm',
};

let engine: WebHaptics | undefined;

export const haptic = (intent: HapticIntent) => {
  try {
    if (!store.get(hapticsEnabledState)) return;
    if (window.OrganizedHaptics?.perform(NATIVE[intent])) return;
    engine ??= new WebHaptics();
    void engine.trigger(HAPTIC_PATTERNS[intent]);
  } catch {
    // never let a non-essential enhancement break the interaction
  }
};
