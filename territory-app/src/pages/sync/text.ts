import { displaySnackNotification } from '@services/states/app';

export const notify = (
  header: string,
  message: string,
  severity: 'success' | 'error' = 'success'
) => displaySnackNotification({ header, message, severity });

export const time = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const when = (seconds: number) => {
  const date = new Date(seconds * 1000);
  const today = new Date().toDateString() === date.toDateString();
  return `${today ? 'Today' : date.toLocaleDateString()} at ${time(date)}`;
};

export const ago = (seconds: number | null) =>
  seconds
    ? `Synced ${when(seconds).replace(/^Today/, 'today')}`
    : 'Never synced';

export const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const ITEMS: Record<string, [string, string]> = {
  territories: ['territory', 'territories'],
  assignments: ['assignment', 'assignments'],
  do_not_calls: ['do-not-call address', 'do-not-call addresses'],
  people: ['name', 'names'],
};

/** "2 territories and 1 assignment" from `{territories: 2, assignments: 1}`. */
export const describeItems = (items?: Record<string, number> | null) => {
  let other = 0;
  const parts: string[] = [];
  for (const [table, n] of Object.entries(items ?? {})) {
    const words = ITEMS[table];
    if (words) parts.push(count(n, ...words));
    else other += n;
  }
  if (other) parts.push(count(other, 'setting', 'settings'));
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
};

export type SyncResult = {
  name?: string;
  sent?: number;
  received?: number;
  items?: Record<string, number> | null;
  conflicts?: number;
  introduced?: string[];
};

/** What a sync brought, in a sentence or two, as the notification says it. */
export const describeSync = (result: SyncResult) => {
  const name = result.name || 'the other phone';
  const items = describeItems(result.items);
  const sent = result.sent ?? 0;
  const lines: string[] = [];
  if (items && sent)
    lines.push(`You got ${items}, and your changes went over too.`);
  else if (items) lines.push(`You got ${items}.`);
  else if (sent)
    lines.push(
      sent === 1
        ? `Your change is now on ${name}’s phone too.`
        : `Your ${sent} changes are now on ${name}’s phone too.`
    );
  else lines.push('Nothing new. You were already up to date.');
  if (result.introduced?.length) {
    lines.push(
      `${result.introduced.join(', ')} joined through ${name}. You now sync with them too.`
    );
  }
  if (result.conflicts) {
    lines.push(
      result.conflicts === 1
        ? '1 detail was changed on both phones. Check it on the Sync page.'
        : `${result.conflicts} details were changed on both phones. Check them on the Sync page.`
    );
  }
  return lines.join(' ');
};
