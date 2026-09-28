import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { store } from '@states/index';
import { settingsState } from '@states/settings';
import { HAPTIC_PATTERNS } from '@services/haptics/patterns';

const trigger = vi.fn(async () => {});
vi.mock('web-haptics', () => ({
  WebHaptics: class {
    trigger = trigger;
  },
}));

const perform = vi.fn<(name: string) => boolean>();
vi.stubGlobal('window', { OrganizedHaptics: { perform } });
vi.useFakeTimers({ toFake: ['Date'] });
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const { announceFound, chosen, play, toggled } = await import('./haptics');

const setEnabled = (value: boolean) =>
  store.set(settingsState, (settings) => ({
    ...settings,
    user_settings: {
      ...settings.user_settings,
      haptics_enabled: { value, updatedAt: '' },
    },
  }));

// what play() settles on plays once the tick is over
const settle = () => Promise.resolve();
const played = () => perform.mock.calls.map(([name]) => name);

let now = 0;
const later = (ms: number) => vi.setSystemTime((now += ms));

beforeEach(() => {
  setEnabled(true);
  perform.mockReset().mockReturnValue(true);
  trigger.mockClear();
  vi.stubGlobal('document', { hidden: false });
  // clear of the last test's haptic and step
  later(10_000);
});

describe('names', () => {
  test.each(['toggleOn', 'toggleOff', 'select', 'step', 'swell', 'heartbeat'])(
    '%s reaches the phone by its own name',
    async (name) => {
      play(name as Parameters<typeof play>[0]);
      await settle();
      expect(played()).toEqual([name]);
    }
  );

  test('a new one without a pattern of its own: a system effect, then the web', async () => {
    perform.mockReturnValue(false);
    play('select');
    await settle();
    expect(played()).toEqual(['select', 'tick']);
    expect(trigger).toHaveBeenCalledWith([{ duration: 8, intensity: 0.5 }]);
  });

  test('an older one falls back to its intent', async () => {
    perform.mockReturnValue(false);
    play('paired');
    await settle();
    expect(played()).toEqual(['paired', 'confirm']);
    expect(trigger).toHaveBeenCalledWith(HAPTIC_PATTERNS.celebrate);
  });

  test('switches and choices', async () => {
    expect(toggled(true)).toBe(true);
    await settle();
    later(1000);
    expect(toggled(false)).toBe(false);
    await settle();
    later(1000);
    expect(chosen('dark')).toBe('dark');
    await settle();
    expect(played()).toEqual(['toggleOn', 'toggleOff', 'select']);
  });
});

describe('rules', () => {
  test('nothing with haptics turned off', async () => {
    setEnabled(false);
    play('paired');
    await settle();
    expect(played()).toEqual([]);
  });

  test('turning haptics off is still felt', async () => {
    toggled(false);
    setEnabled(false);
    await settle();
    expect(played()).toEqual(['toggleOff']);
  });

  test('nothing while the page is hidden', async () => {
    vi.stubGlobal('document', { hidden: true });
    play('swell');
    await settle();
    expect(played()).toEqual([]);
  });

  test('steps at most one per 40 ms', async () => {
    for (const gap of [0, 10, 20, 15, 40]) {
      later(gap);
      play('step');
      await settle();
    }
    // at 0, 45 (10 + 20 + 15) and 85
    expect(played()).toEqual(['step', 'step', 'step']);
  });

  test('of two in one tick, only the stronger', async () => {
    play('found');
    play('code');
    play('found');
    await settle();
    expect(played()).toEqual(['code']);
  });

  test('a lesser one right after a stronger one is left out', async () => {
    play('paired');
    await settle();
    later(100);
    play('synced');
    await settle();
    later(100);
    play('paired');
    await settle();
    later(700);
    play('synced');
    await settle();
    expect(played()).toEqual(['paired', 'paired', 'synced']);
  });

  test('a quick second flick of a switch is felt too', async () => {
    toggled(true);
    await settle();
    later(150);
    toggled(false);
    await settle();
    expect(played()).toEqual(['toggleOn', 'toggleOff']);
  });

  test('the first ripple’s wave, then no swell on top of it', async () => {
    play('wave');
    await settle();
    later(50);
    play('swell');
    await settle();
    later(1150);
    play('swell');
    await settle();
    expect(played()).toEqual(['wave', 'swell']);
  });
});

describe('found', () => {
  test('once for each device that shows up', async () => {
    const announced = new Set<string>();
    announceFound(announced, ['a']);
    await settle();
    later(1000);
    announceFound(announced, ['a']);
    await settle();
    later(1000);
    announceFound(announced, ['a', 'b', 'c']);
    await settle();
    later(1000);
    announceFound(announced, ['b']);
    await settle();
    expect(played()).toEqual(['found', 'found']);
    expect([...announced]).toEqual(['a', 'b', 'c']);
  });
});
