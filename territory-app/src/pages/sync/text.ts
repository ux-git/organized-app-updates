import { displaySnackNotification } from '@services/states/app';
import { list, t } from '../../i18n';

export const notify = (
  header: string,
  message: string,
  severity: 'success' | 'error' = 'success'
) => displaySnackNotification({ header, message, severity });

export const time = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** "Today at 10:30", or "today at 10:30" inside a sentence. */
export const when = (seconds: number, inline = false) => {
  const date = new Date(seconds * 1000);
  const today = new Date().toDateString() === date.toDateString();
  const day = today
    ? t(inline ? 'time.todayInline' : 'time.today')
    : date.toLocaleDateString();
  return t('time.when', { day, time: time(date) });
};

export const ago = (seconds: number | null) =>
  seconds
    ? t('time.synced', { when: when(seconds, true) })
    : t('time.neverSynced');

/** "1 territory", "2 territories": a count key in the locales. */
export const count = (n: number, what: string) =>
  t(`count.${what}`, { count: n });

const ITEMS: Record<string, string> = {
  territories: 'territories',
  assignments: 'assignments',
  do_not_calls: 'doNotCalls',
  people: 'names',
};

/** "2 territories and 1 assignment" from `{territories: 2, assignments: 1}`. */
export const describeItems = (items?: Record<string, number> | null) => {
  let other = 0;
  const parts: string[] = [];
  for (const [table, n] of Object.entries(items ?? {})) {
    const what = ITEMS[table];
    if (what) parts.push(count(n, what));
    else other += n;
  }
  if (other) parts.push(count(other, 'settings'));
  return list(parts);
};

export type SyncResult = {
  name?: string;
  sent?: number;
  received?: number;
  items?: Record<string, number> | null;
  territories?: { number: string }[];
  conflicts?: number;
  introduced?: string[];
  /** Devices this sync heard were removed from the group. */
  removed?: string[];
};

/** How a pairing code starts, scanned or opened. */
export const CARD_PREFIX = 'OTC1:';

/** The core's reason for a sync with a device that no longer knows this one. */
export const ONE_SIDED_REASON = 'not paired on the other device';

// the core's reasons for a stopped sync that someone can act on
const REASONS: Record<string, string> = {
  'removed from the group': 'sync.removedBanner',
  'the other phone was removed from the group': 'sync.otherRemoved',
  'update the app on both devices': 'sync.outdated',
  [ONE_SIDED_REASON]: 'sync.oneSided',
};

/** Why the core refuses a pairing: the id or key is another paired device's. */
export const PAIR_CLASH = 'the code does not match a paired device';

export const isRemovedReason = (reason?: string) =>
  reason === 'removed from the group';

/** What a failed sync's reason says, for the reasons the core reports. */
export const reasonText = (reason?: string) => {
  const key = REASONS[reason ?? ''];
  return key ? t(key) : undefined;
};

/** What a sync brought, in a sentence or two, as the notification says it. */
export const describeSync = (result: SyncResult) => {
  const numbers = (result.territories ?? []).map((item) =>
    t('result.number', { number: item.number })
  );
  const people = result.items?.people ?? 0;
  const lines: string[] = [];
  if (numbers.length) {
    lines.push(
      t('result.territoriesChanged', {
        count: numbers.length,
        numbers: list(numbers),
      })
    );
  }
  if (people) {
    lines.push(t('result.namesChanged', { names: count(people, 'names') }));
  }
  if (!lines.length && result.sent) lines.push(t('result.sentOnly'));
  if (!lines.length) lines.push(t('result.nothingNew'));
  if (result.introduced?.length) {
    lines.push(t('result.joined', { names: list(result.introduced) }));
  }
  if (result.removed?.length) {
    lines.push(
      t('result.removed', {
        count: result.removed.length,
        names: list(result.removed),
      })
    );
  }
  if (result.conflicts) {
    lines.push(t('result.conflicts', { count: result.conflicts }));
  }
  return lines.join(' ');
};
