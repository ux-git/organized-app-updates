import { WebHaptics, type Vibration } from 'web-haptics';
import { store } from '@states/index';
import { hapticsEnabledState, settingsState } from '@states/settings';
import { HAPTIC_PATTERNS, type HapticIntent } from '@services/haptics/patterns';

export type { HapticIntent } from '@services/haptics/patterns';

declare global {
  interface Window {
    OrganizedHaptics?: { perform: (intent: string) => boolean };
  }
}

// per device, in localStorage like the theme, not in the synced store
const ENABLED = 'haptics_enabled';

const apply = (on: boolean) =>
  store.set(settingsState, (settings) => ({
    ...settings,
    user_settings: {
      ...settings.user_settings,
      haptics_enabled: { value: on, updatedAt: '' },
    },
  }));

// on import: nothing else writes the setting, and only this module reads it
try {
  apply(localStorage.getItem(ENABLED) !== 'false');
} catch {
  // stays on
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

/** The app's own vibrations (Haptics.kt, Haptics.swift); a plain one elsewhere. */
export type SyncHaptic =
  | 'wave'
  | 'swell'
  | 'contact'
  | 'found'
  | 'code'
  | 'heartbeat'
  | 'start'
  | 'paired'
  | 'synced'
  | 'error'
  | 'remove'
  | 'toggleOn'
  | 'toggleOff'
  | 'select'
  | 'step';

/** One of Android's own effects, else a web pattern. */
type Fallback = { effect: string; pattern: Vibration[] };

const FALLBACK: Record<SyncHaptic, HapticIntent | Fallback> = {
  wave: 'tap',
  swell: { effect: 'tick', pattern: [{ duration: 30, intensity: 0.25 }] },
  contact: 'tap',
  found: 'tap',
  code: 'tap',
  heartbeat: {
    effect: 'tick',
    pattern: [
      { duration: 10, intensity: 0.4 },
      { delay: 180, duration: 10, intensity: 0.3 },
    ],
  },
  start: 'tap',
  paired: 'celebrate',
  synced: 'celebrate',
  error: 'limit',
  remove: 'reset',
  toggleOn: {
    effect: 'toggleOn',
    pattern: [
      { duration: 12, intensity: 0.3 },
      { duration: 14, intensity: 0.8 },
    ],
  },
  toggleOff: {
    effect: 'toggleOff',
    pattern: [{ duration: 16, intensity: 0.35 }],
  },
  select: { effect: 'tick', pattern: [{ duration: 8, intensity: 0.5 }] },
  step: { effect: 'tick', pattern: [{ duration: 5, intensity: 0.3 }] },
};

// Of two in one tick the one later here plays, and a lesser one doesn't cut
// into one still going: it would blur it, or stop it short.
const RANK: SyncHaptic[] = [
  'step',
  'swell',
  'heartbeat',
  'select',
  'toggleOff',
  'toggleOn',
  'wave',
  'start',
  'found',
  'contact',
  'code',
  'remove',
  'synced',
  'error',
  'paired',
];
// about how long each is felt, in ms
const LENGTH: Record<SyncHaptic, number> = {
  step: 10,
  swell: 400,
  heartbeat: 210,
  select: 20,
  toggleOff: 30,
  toggleOn: 50,
  wave: 750,
  start: 120,
  found: 120,
  contact: 110,
  code: 120,
  remove: 90,
  synced: 260,
  error: 220,
  paired: 400,
};
const STEP_MS = 40;

let pending: SyncHaptic | undefined;
let last = { rank: -1, until: -Infinity };
let lastStep = -Infinity;

const flush = () => {
  const name = pending!;
  pending = undefined;
  const now = Date.now();
  const rank = RANK.indexOf(name);
  if (now < last.until && rank < last.rank) return;
  last = { rank, until: now + LENGTH[name] };
  try {
    if (window.OrganizedHaptics?.perform(name)) return;
    const stand = FALLBACK[name];
    if (typeof stand === 'string') {
      haptic(stand);
    } else if (!window.OrganizedHaptics?.perform(stand.effect)) {
      engine ??= new WebHaptics();
      void engine.trigger(stand.pattern);
    }
  } catch {
    // as above
  }
};

export const play = (name: SyncHaptic) => {
  try {
    if (!store.get(hapticsEnabledState) || globalThis.document?.hidden) return;
    if (name === 'step') {
      const now = Date.now();
      if (now - lastStep < STEP_MS) return;
      lastStep = now;
    }
    // all asked for in one tick settle on one
    if (pending) {
      if (RANK.indexOf(name) > RANK.indexOf(pending)) pending = name;
      return;
    }
    pending = name;
    queueMicrotask(flush);
  } catch {
    // as above
  }
};

/** A switch landing on `on`, felt as it goes; hands the value on. */
export const toggled = (on: boolean) => {
  play(on ? 'toggleOn' : 'toggleOff');
  return on;
};

export const setHapticsEnabled = (on: boolean) => {
  // felt while still on: a preview right after turning on, once more before off
  if (on) apply(true);
  toggled(on);
  if (!on) apply(false);
  try {
    localStorage.setItem(ENABLED, String(on));
  } catch {
    // applies until the app restarts
  }
};

/** A choice (a select, radio or tab), felt as a tick; hands it on. */
export const chosen = <T>(value: T) => {
  play('select');
  return value;
};

/** On radios this app doesn't render itself, as a capture: a new pick ticks. */
export const pickedRadio = (event: { target: EventTarget }) => {
  const radio = (event.target as Element).closest?.('[role="radio"]');
  if (radio?.getAttribute('aria-checked') === 'false') play('select');
};

const clocks = new WeakSet<Element>();

/** On a time picker: each value its clock's hand passes is a step. */
export const clockSteps = (event: { target: EventTarget }) => {
  const clock = (event.target as Element).closest?.('.MuiClock-root');
  if (!clock || clocks.has(clock)) return;
  clocks.add(clock);
  // the clock names the time it points at in its label
  new MutationObserver(() => play('step')).observe(clock, {
    subtree: true,
    attributeFilter: ['aria-label'],
  });
};

/** `found` once for each device that shows up; `announced` remembers them. */
export const announceFound = (announced: Set<string>, addresses: string[]) => {
  const fresh = addresses.filter((address) => !announced.has(address));
  fresh.forEach((address) => announced.add(address));
  if (fresh.length) play('found');
};
