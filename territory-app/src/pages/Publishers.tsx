import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Stack } from '@mui/material';
import { IconAdd, IconDelete, IconImportExport } from '@icons/index';
import Button from '@components/button';
import Checkbox from '@components/checkbox';
import Dialog from '@components/dialog';
import NavBarButton from '@components/nav_bar_button';
import NavBarButtonGroup from '@components/nav_bar_button_group';
import PageTitle from '@components/page_title';
import SearchBar from '@components/search_bar';
import TextField from '@components/textfield';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import {
  applyImport,
  ImportPlan,
  planImport,
  readBackup,
  readList,
} from '../people';
import { loadPeople, PEOPLE, Person, writeRows } from '../persistence';
import { notify } from './sync/dialogs';
import { Avatar } from './sync/parts';
import usePeople from './usePeople';

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const ImportDialog = ({
  open,
  people,
  onClose,
}: {
  open: boolean;
  people: Person[];
  onClose: VoidFunction;
}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [list, setList] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [removeMissing, setRemoveMissing] = useState(false);

  const close = () => {
    setPlan(null);
    setList('');
    setRemoveMissing(false);
    onClose();
  };

  const openBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const { incoming, skipped } = readBackup(await file.text());
      setPlan(planImport(people, incoming, skipped));
    } catch (error) {
      notify('Something went wrong', (error as Error).message, 'error');
    }
  };

  const confirm = async () => {
    if (!plan) return;
    await applyImport(plan, removeMissing);
    notify(
      'Publishers imported',
      `${count(plan.add.length, 'name', 'names')} added, ${count(plan.update.length, 'name', 'names')} updated.`
    );
    close();
  };

  if (plan) {
    const rows = [
      ['New', plan.add.length],
      ['Updated', plan.update.length],
      ['Already here', plan.unchanged],
      ['Archived, not imported', plan.skipped],
    ] as const;
    return (
      <Dialog open={open} onClose={close} title="Import publishers">
        <Stack spacing="8px" sx={{ width: '100%' }}>
          {rows.map(([label, value]) => (
            <Box
              key={label}
              sx={{ display: 'flex', justifyContent: 'space-between' }}
            >
              <Typography className="body-regular">{label}</Typography>
              <Typography className="body-regular" color="var(--grey-400)">
                {value}
              </Typography>
            </Box>
          ))}
        </Stack>
        {plan.missing.length > 0 && (
          <Checkbox
            checked={removeMissing}
            onChange={(_, checked) => setRemoveMissing(checked)}
            label={`Remove ${count(plan.missing.length, 'name', 'names')} that aren’t in the backup`}
            labelDescription="For example, people who moved away. Their assignment history stays."
          />
        )}
        <Button variant="main" onClick={confirm}>
          Import
        </Button>
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Import publishers"
      description="Only names and field service groups are taken. Addresses, phone numbers and reports in the backup stay out of this app."
    >
      <Stack spacing="8px" sx={{ width: '100%' }}>
        <Typography className="h4">From an Organized backup</Typography>
        <Typography className="body-small-regular" color="var(--grey-400)">
          In Organized, open Congregation settings and export a backup. A backup
          converted from NW Scheduler works too.
        </Typography>
        <Button variant="main" onClick={() => fileInput.current?.click()}>
          Choose backup file
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={openBackup}
        />
      </Stack>
      <Stack spacing="8px" sx={{ width: '100%' }}>
        <Typography className="h4">Paste a list</Typography>
        <TextField
          label="One name per line"
          multiline
          minRows={3}
          value={list}
          onChange={(event) => setList(event.target.value)}
        />
        <Button
          variant="secondary"
          disabled={!list.trim()}
          onClick={() => setPlan(planImport(people, readList(list)))}
        >
          Continue
        </Button>
      </Stack>
      <Button variant="tertiary" onClick={close}>
        Cancel
      </Button>
    </Dialog>
  );
};

const NameDialog = ({
  person,
  onClose,
}: {
  person: Person | 'new' | null;
  onClose: VoidFunction;
}) => {
  const existing = person && person !== 'new' ? person : null;
  const [name, setName] = useState('');
  const [group, setGroup] = useState(false);
  const [shown, setShown] = useState<typeof person>(null);

  if (person !== shown) {
    setShown(person);
    setName(existing?.name ?? '');
    setGroup(existing?.group ?? false);
  }

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await writeRows([
      {
        table: PEOPLE,
        id: existing?.id ?? crypto.randomUUID(),
        fields: { name: trimmed, group },
      },
    ]);
    await loadPeople();
    onClose();
  };

  return (
    <Dialog
      open={!!person}
      onClose={onClose}
      title={existing ? 'Edit name' : 'Add name'}
    >
      <TextField
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && save()}
      />
      <Checkbox
        checked={group}
        onChange={(_, checked) => setGroup(checked)}
        label="Field service group"
        labelDescription="A whole group can work a territory together."
      />
      <Button variant="main" disabled={!name.trim()} onClick={save}>
        Save
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
    </Dialog>
  );
};

const Publishers = () => {
  const people = usePeople();
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Person | 'new' | null>(null);

  const [groups, publishers] = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const shown = people
      .filter((person) => person.name.toLocaleLowerCase().includes(query))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })
      );
    return [
      shown.filter((person) => person.group),
      shown.filter((person) => !person.group),
    ];
  }, [people, search]);

  const remove = async (person: Person) => {
    if (
      !window.confirm(`Remove ${person.name}? Their assignment history stays.`)
    ) {
      return;
    }
    await writeRows([{ table: PEOPLE, id: person.id, deleted: true }]);
    await loadPeople();
  };

  const section = (title: string, list: Person[]) =>
    list.length > 0 && (
      <CardSection>
        <CardSectionHeader title={`${title} (${list.length})`} />
        <Stack spacing="2px">
          {list.map((person) => (
            <Box
              key={person.id}
              role="button"
              tabIndex={0}
              onClick={() => setEditing(person)}
              onKeyDown={(event) => event.key === 'Enter' && setEditing(person)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '6px 8px',
                marginInline: '-8px',
                borderRadius: 'var(--radius-l)',
                cursor: 'pointer',
                '&:hover': { backgroundColor: 'var(--accent-150)' },
              }}
            >
              <Avatar name={person.name} />
              <Typography
                className="body-regular"
                sx={{ flex: 1, minWidth: 0 }}
              >
                {person.name}
              </Typography>
              <IconButton
                aria-label={`Remove ${person.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  remove(person);
                }}
              >
                <IconDelete color="var(--grey-400)" />
              </IconButton>
            </Box>
          ))}
        </Stack>
      </CardSection>
    );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PageTitle
        title="Publishers and groups"
        buttons={
          <NavBarButtonGroup>
            <NavBarButton
              text="Import"
              icon={<IconImportExport />}
              onClick={() => setImportOpen(true)}
            />
            <NavBarButton
              text="Add"
              icon={<IconAdd />}
              main
              onClick={() => setEditing('new')}
            />
          </NavBarButtonGroup>
        }
      />

      {people.length === 0 ? (
        <CardSection>
          <CardSectionHeader
            title="No names yet"
            description="Territories are assigned to these names. Import them from an Organized backup, paste a list, or add them one by one. They are shared with your paired phones only."
          />
          <Box>
            <Button variant="main" onClick={() => setImportOpen(true)}>
              Import publishers
            </Button>
          </Box>
        </CardSection>
      ) : (
        <>
          <SearchBar
            placeholder="Search names"
            value={search}
            onSearch={setSearch}
          />
          {section('Field service groups', groups)}
          {section('Publishers', publishers)}
          {groups.length + publishers.length === 0 && (
            <Typography className="body-regular" color="var(--grey-400)">
              No names match your search
            </Typography>
          )}
        </>
      )}

      <ImportDialog
        open={importOpen}
        people={people}
        onClose={() => setImportOpen(false)}
      />
      <NameDialog person={editing} onClose={() => setEditing(null)} />
    </Box>
  );
};

export default Publishers;
