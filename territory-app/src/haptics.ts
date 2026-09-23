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

/** The sync's own vibrations (Haptics.kt); a plain one elsewhere. */
export type SyncHaptic =
  | 'wave'
  | 'contact'
  | 'found'
  | 'code'
  | 'start'
  | 'paired'
  | 'synced'
  | 'error'
  | 'remove';

const FALLBACK: Record<SyncHaptic, HapticIntent> = {
  wave: 'tap',
  contact: 'tap',
  found: 'tap',
  code: 'tap',
  start: 'tap',
  paired: 'celebrate',
  synced: 'celebrate',
  error: 'limit',
  remove: 'reset',
};

export const play = (name: SyncHaptic) => {
  try {
    if (!store.get(hapticsEnabledState)) return;
    if (window.OrganizedHaptics?.perform(name)) return;
    haptic(FALLBACK[name]);
  } catch {
    // as above
  }
};
