import { localStorageGetItem } from '@utils/common';
import { AssignmentCard, AssignmentHolder } from '@definition/territory';

// per device, like the map provider: whoever prints the cards keeps printing
const CARD_KEY = 'territory_assignment_card';

// 'none' when it was left unchosen last time; digital until anything is saved
export const savedCard = (): AssignmentCard | undefined => {
  const saved = localStorageGetItem(CARD_KEY);
  if (saved === 'none') return undefined;
  return saved === 'printed' ? 'printed' : 'digital';
};

export const rememberCard = (card?: AssignmentCard) =>
  localStorage.setItem(CARD_KEY, card ?? 'none');

// the last assign went to a group or a publisher; a group stays picked for the next
const MODE_KEY = 'territory_assignment_mode';
const GROUP_KEY = 'territory_assignment_group';

export type HolderMode = 'publisher' | 'group';

const stored = (key: string) => {
  try {
    return localStorageGetItem(key) ?? '';
  } catch {
    return '';
  }
};

export const savedHolder = () => ({
  mode: (stored(MODE_KEY) === 'group' ? 'group' : 'publisher') as HolderMode,
  group: stored(GROUP_KEY),
});

export const rememberHolder = (group?: string) => {
  try {
    localStorage.setItem(MODE_KEY, group ? 'group' : 'publisher');
    if (group) localStorage.setItem(GROUP_KEY, group);
  } catch {
    // storage off, as in a private window: the dialog starts from its defaults
  }
};

export type HolderChoice = {
  mode: HolderMode;
  publisher: string | null;
  group: string | null;
};

// from the assignment being changed, else the way the last one went out
export const initialHolder = (
  current: Partial<AssignmentHolder> | undefined,
  groups: string[],
  publisher?: string
): HolderChoice => {
  if (current?.publisher || current?.group) {
    return {
      mode: current.group ? 'group' : 'publisher',
      group: current.group ?? null,
      publisher: publisher ?? (current.publisher || null),
    };
  }

  const saved = savedHolder();

  return {
    mode: saved.mode,
    group:
      saved.mode === 'group' && groups.includes(saved.group)
        ? saved.group
        : null,
    publisher: publisher ?? null,
  };
};

export const holderMissing = ({ mode, publisher, group }: HolderChoice) =>
  !publisher || (mode === 'group' && !group);

export const chosenHolder = ({
  mode,
  publisher,
  group,
}: HolderChoice): AssignmentHolder =>
  mode === 'group' && group
    ? { publisher: publisher ?? '', group }
    : { publisher: publisher ?? '' };
