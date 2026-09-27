import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import i18n from '@services/i18n/index';
import { displaySnackNotification } from '@services/states/app';
import { list } from '../../i18n';
import {
  ago,
  count,
  describeItems,
  describeSync,
  isRemovedReason,
  notify,
  removalText,
  when,
} from './text';

vi.mock('@services/states/app', () => ({ displaySnackNotification: vi.fn() }));

const at = (iso: string) => new Date(iso).getTime() / 1000;
const clock = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

beforeEach(() => i18n.changeLanguage('eng'));

describe('list', () => {
  test('joins with commas and "and"', () => {
    expect(list([])).toBe('');
    expect(list(['A'])).toBe('A');
    expect(list(['A', 'B'])).toBe('A and B');
    expect(list(['A', 'B', 'C'])).toBe('A, B and C');
  });

  test('says "und" in German', async () => {
    await i18n.changeLanguage('deu');
    expect(list(['A', 'B', 'C'])).toBe('A, B und C');
  });
});

describe('count', () => {
  test('picks one or other', () => {
    expect(count(1, 'territories')).toBe('1 territory');
    expect(count(2, 'territories')).toBe('2 territories');
    expect(count(0, 'names')).toBe('0 names');
    expect(count(1, 'doNotCalls')).toBe('1 do-not-call address');
  });

  test('in German', async () => {
    await i18n.changeLanguage('deu');
    expect(count(1, 'phones')).toBe('1 Gerät');
    expect(count(3, 'phones')).toBe('3 Geräte');
  });
});

describe('describeItems', () => {
  test('names each table it knows', () => {
    expect(describeItems({ territories: 2, assignments: 1 })).toBe(
      '2 territories and 1 assignment'
    );
    expect(describeItems({ territories: 1, do_not_calls: 2, people: 3 })).toBe(
      '1 territory, 2 do-not-call addresses and 3 names'
    );
  });

  test('counts every other table as settings, last', () => {
    expect(describeItems({ settings: 1, territories: 1, categories: 2 })).toBe(
      '1 territory and 3 settings'
    );
  });

  test('says nothing for nothing', () => {
    expect(describeItems(null)).toBe('');
    expect(describeItems(undefined)).toBe('');
    expect(describeItems({})).toBe('');
  });
});

describe('when and ago', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  test('today, capitalised on its own and not inside a sentence', () => {
    const seconds = at('2026-09-27T10:30:00Z');
    const time = clock(new Date(seconds * 1000));
    expect(time).toMatch(/10:30/);
    expect(when(seconds)).toBe(`Today at ${time}`);
    expect(when(seconds, true)).toBe(`today at ${time}`);
  });

  test('another day by its date', () => {
    const seconds = at('2026-09-20T08:05:00Z');
    const date = new Date(seconds * 1000);
    expect(when(seconds)).toBe(
      `${date.toLocaleDateString()} at ${clock(date)}`
    );
  });

  test('ago', () => {
    const seconds = at('2026-09-27T10:30:00Z');
    expect(ago(seconds)).toBe(
      `Synced today at ${clock(new Date(seconds * 1000))}`
    );
    expect(ago(null)).toBe('Never synced');
    expect(ago(0)).toBe('Never synced');
  });

  test('in German', async () => {
    await i18n.changeLanguage('deu');
    const seconds = at('2026-09-27T10:30:00Z');
    expect(ago(seconds)).toBe(
      `Synchronisiert heute um ${clock(new Date(seconds * 1000))}`
    );
    expect(ago(null)).toBe('Noch nie synchronisiert');
  });
});

describe('describeSync', () => {
  const territories = (...numbers: string[]) =>
    numbers.map((number) => ({ number }));

  test('territory numbers with a number sign', () => {
    expect(describeSync({ territories: territories('12') })).toBe(
      'Territory #12 changed.'
    );
    expect(describeSync({ territories: territories('1', '2', '12') })).toBe(
      'Territories #1, #2 and #12 changed.'
    );
  });

  test('"Nr." once in German', async () => {
    await i18n.changeLanguage('deu');
    expect(describeSync({ territories: territories('12') })).toBe(
      'Gebiet Nr. 12 wurde geändert.'
    );
    expect(describeSync({ territories: territories('1', '2', '12') })).toBe(
      'Gebiete Nr. 1, 2 und 12 wurden geändert.'
    );
  });

  test('names, joins and conflicts follow', () => {
    expect(
      describeSync({
        territories: territories('3'),
        items: { people: 2 },
        introduced: ['Anna', 'Ben'],
        conflicts: 1,
      })
    ).toBe(
      'Territory #3 changed. 2 names changed. Anna and Ben joined your devices. You now sync with them too. 1 detail was changed on both devices. Check it under Sync and pairing.'
    );
  });

  test('only sent, or nothing new', () => {
    expect(describeSync({ sent: 4 })).toBe(
      'Your changes are on their device now too.'
    );
    expect(describeSync({})).toBe('Nothing new. You were already up to date.');
  });
});

test('notify shows a snackbar', () => {
  notify('Saved', 'All good');
  expect(displaySnackNotification).toHaveBeenCalledWith({
    header: 'Saved',
    message: 'All good',
    severity: 'success',
  });
});

describe('removals', () => {
  test('a sync names the devices removed from the group', () => {
    expect(describeSync({ sent: 1, removed: ['Anna'] })).toBe(
      'Your changes are on their device now too. Anna was removed from the group.'
    );
    expect(describeSync({ removed: ['Anna', 'Ben'] })).toBe(
      'Nothing new. You were already up to date. Anna and Ben were removed from the group.'
    );
  });

  test('the core’s two reasons, translated', async () => {
    expect(removalText('removed from the group')).toBe(
      'This device was removed from the group. Pair with someone again to rejoin.'
    );
    expect(removalText('the other phone was removed from the group')).toBe(
      'The other device was removed from the group.'
    );
    expect(removalText('connection lost')).toBeUndefined();
    expect(removalText(undefined)).toBeUndefined();
    expect(isRemovedReason('removed from the group')).toBe(true);
    expect(isRemovedReason('the other phone was removed from the group')).toBe(
      false
    );

    await i18n.changeLanguage('deu');
    expect(removalText('the other phone was removed from the group')).toBe(
      'Das andere Gerät wurde aus der Gruppe entfernt.'
    );
    expect(describeSync({ removed: ['Anna'] })).toContain(
      'Anna wurde aus der Gruppe entfernt.'
    );
  });
});
