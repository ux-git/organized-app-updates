import { useAtomValue } from 'jotai';
import { Stack } from '@mui/material';
import { Typography } from '@components/index';
import TabSwitcher from '@components/tab_switcher';
import { useBreakpoints } from '@hooks/index';
import { AssignmentHolder } from '@definition/territory';
import { territoryAssigneesState } from '../assignees';
import { HolderChoice, HolderMode } from '../card_choice';
import PublisherSearch from './publisher_search';
import { tx } from '@services/i18n/translation';

const Hint = ({ text }: { text: string }) => (
  <Typography
    role="alert"
    className="label-small-regular"
    color="var(--red-main)"
    sx={{ paddingInline: '16px' }}
  >
    {text}
  </Typography>
);

export const HolderModeSwitch = ({
  value,
  onChange,
}: {
  value: HolderChoice;
  onChange: (next: HolderChoice) => void;
}) => (
  <TabSwitcher
    ariaLabel={tx('Assign to')}
    surface="light"
    value={value.mode}
    onChange={(mode: HolderMode) => onChange({ ...value, mode })}
    options={[
      { value: 'publisher', label: tx('Publisher') },
      { value: 'group', label: tx('Group') },
    ]}
    sx={{ width: '100%', '& button': { minHeight: '36px' } }}
  />
);

// people only, and in group mode the group first; a hint shows on an empty
// field once a save was tried
export const HolderPickers = ({
  value,
  onChange,
  showMissing,
  autoFocus,
  current,
}: {
  value: HolderChoice;
  onChange: (next: HolderChoice) => void;
  showMissing: boolean;
  autoFocus?: boolean;
  // names no longer on the list, e.g. someone who moved, stay choosable
  current?: Partial<AssignmentHolder>;
}) => {
  const { tablet600Up } = useBreakpoints();

  const assignees = useAtomValue(territoryAssigneesState);
  const namesOf = (group: boolean, kept?: string) => {
    const names = assignees
      .filter((item) => item.group === group)
      .map(({ name }) => name);
    return kept && !names.includes(kept) ? [...names, kept] : names;
  };
  const people = namesOf(false, current?.publisher);
  const groups = namesOf(true, current?.group);

  const isGroup = value.mode === 'group';

  return (
    <Stack
      direction={tablet600Up ? 'row' : 'column'}
      spacing="16px"
      sx={{ width: '100%' }}
    >
      {isGroup && (
        <Stack spacing="4px" sx={{ flex: 1, minWidth: 0 }}>
          <PublisherSearch
            label={tx('Group')}
            placeholder={tx('Search groups…')}
            options={groups}
            value={value.group}
            onChange={(group) => onChange({ ...value, group })}
            getName={(name) => name}
            autoFocus={autoFocus && !value.group}
          />
          {showMissing && !value.group && <Hint text={tx('Choose a group')} />}
        </Stack>
      )}

      <Stack spacing="4px" sx={{ flex: 1, minWidth: 0 }}>
        <PublisherSearch
          label={isGroup ? tx('Taken by') : tx('Publisher')}
          options={people}
          value={value.publisher}
          onChange={(publisher) => onChange({ ...value, publisher })}
          getName={(name) => name}
          autoFocus={
            autoFocus && !value.publisher && (!isGroup || !!value.group)
          }
        />
        {showMissing && !value.publisher && (
          <Hint
            text={isGroup ? tx('Choose who took it') : tx('Choose a publisher')}
          />
        )}
      </Stack>
    </Stack>
  );
};
