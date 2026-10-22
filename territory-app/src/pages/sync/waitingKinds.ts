import { t } from '../../i18n';

export type Kind =
  | 'territories'
  | 'assignments'
  | 'do_not_calls'
  | 'people'
  | 'settings';

export const KINDS: Kind[] = [
  'territories',
  'assignments',
  'do_not_calls',
  'people',
  'settings',
];

export const kindOf = (table: string): Kind =>
  (KINDS as string[]).includes(table) ? (table as Kind) : 'settings';

export const kindLabel = (kind: Kind) => t(`waiting.kinds.${kind}`);

// each kind keeps one tint, so a long list scans by colour
export const kindTint: Record<Kind, string> = {
  territories: 'var(--accent-main)',
  assignments: 'var(--green-main)',
  do_not_calls: 'var(--red-main)',
  people: 'var(--orange-main)',
  settings: 'var(--grey-400)',
};
