import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box, Stack } from '@mui/material';
import { Typography } from '@components/index';
import { IconAdd } from '@icons/index';
import TabSwitcher from '@components/tab_switcher';
import { useBreakpoints } from '@hooks/index';
import { AssignmentHolder } from '@definition/territory';
import { addAssignee, territoryAssigneesState } from '../assignees';
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

// what a search shows when the typed name isn't on the list: add it there and
// then, so the assignment can go ahead
const AddName = ({
  name,
  group,
  onAdded,
}: {
  name: string;
  group: boolean;
  onAdded: (name: string) => void;
}) => {
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  if (!addAssignee || !trimmed) return tx('No results');

  return (
    <Box
      component="button"
      type="button"
      className="body-small-semibold"
      disabled={busy}
      // keeps the list open until the click lands
      onMouseDown={(event) => event.preventDefault()}
      onClick={async () => {
        setBusy(true);
        try {
          await addAssignee!(trimmed, group);
          onAdded(trimmed);
        } finally {
          setBusy(false);
        }
      }}
      sx={{
        all: 'unset',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
        color: 'var(--accent-main)',
        '& svg path': { fill: 'currentColor' },
        '&:hover': { color: 'var(--accent-dark)' },
        '&:disabled': { opacity: 0.5, cursor: 'default' },
      }}
    >
      <IconAdd width={20} height={20} />
      {group
        ? tx('Add the group “{{name}}”', { name: trimmed })
        : tx('Add “{{name}}” as a publisher', { name: trimmed })}
    </Box>
  );
};

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
  const [groupQuery, setGroupQuery] = useState('');
  const [personQuery, setPersonQuery] = useState('');

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
            onInputChange={setGroupQuery}
            noOptionsText={
              <AddName
                name={groupQuery}
                group
                onAdded={(group) => onChange({ ...value, group })}
              />
            }
            autoFocus={autoFocus && !value.group}
          />
          {showMissing && !value.group && <Hint text={tx('Choose a group')} />}
        </Stack>
      )}

      <Stack spacing="4px" sx={{ flex: 1, minWidth: 0 }}>
        <PublisherSearch
          label={isGroup ? tx('Assigned to') : tx('Publisher')}
          options={people}
          value={value.publisher}
          onChange={(publisher) => onChange({ ...value, publisher })}
          getName={(name) => name}
          onInputChange={setPersonQuery}
          noOptionsText={
            <AddName
              name={personQuery}
              group={false}
              onAdded={(publisher) => onChange({ ...value, publisher })}
            />
          }
          autoFocus={
            autoFocus && !value.publisher && (!isGroup || !!value.group)
          }
        />
        {showMissing && !value.publisher && (
          <Hint
            text={
              isGroup
                ? tx('Choose who it is assigned to')
                : tx('Choose a publisher')
            }
          />
        )}
      </Stack>
    </Stack>
  );
};

// one person, e.g. who gave a territory back; a name no longer on the list
// stays choosable
export const PublisherPicker = ({
  label,
  value,
  onChange,
  current,
}: {
  label: string;
  value: string;
  onChange: (publisher: string) => void;
  current?: string;
}) => {
  const assignees = useAtomValue(territoryAssigneesState);
  const [query, setQuery] = useState('');

  const names = assignees.filter((item) => !item.group).map(({ name }) => name);
  const people =
    current && !names.includes(current) ? [...names, current] : names;

  return (
    <PublisherSearch
      label={label}
      options={people}
      value={value || null}
      onChange={(publisher) => onChange(publisher ?? '')}
      getName={(name) => name}
      onInputChange={setQuery}
      noOptionsText={<AddName name={query} group={false} onAdded={onChange} />}
    />
  );
};
