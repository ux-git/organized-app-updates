import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { Box, Stack } from '@mui/material';
import { IconAdd, IconDelete, IconImportExport } from '@icons/index';
import Button from '@components/button';
import Checkbox from '@components/checkbox';
import { NavBarOptionsType } from '@definition/app';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import IconButton from '@components/icon_button';
import NavBarButton from '@components/nav_bar_button';
import NavBarButtonGroup from '@components/nav_bar_button_group';
import PageTitle from '@components/page_title';
import SearchBar from '@components/search_bar';
import TextField from '@components/textfield';
import SwitchWithLabel from '@components/switch_with_label';
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
import { play } from '../haptics';
import { confirm } from './confirm';
import { t } from '../i18n';
import { count, notify } from './sync/text';
import { Actions, Avatar } from './sync/parts';
import usePeople from './usePeople';

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
  const [source, setSource] = useState<'backup' | 'list'>('backup');
  const [busy, setBusy] = useState(false);

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
      setSource('backup');
      setPlan(planImport(people, incoming, skipped));
    } catch (error) {
      notify(t('common.somethingWrong'), (error as Error).message, 'error');
    }
  };

  const confirm = async () => {
    if (!plan || busy) return;
    setBusy(true);
    try {
      await applyImport(plan, removeMissing);
      notify(
        t('publishers.imported'),
        t('publishers.importedText', {
          added: count(plan.add.length, 'names'),
          updated: count(plan.update.length, 'names'),
        })
      );
      close();
    } catch (error) {
      notify(t('common.somethingWrong'), String(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const planList = () => {
    setSource('list');
    setPlan(planImport(people, readList(list)));
  };

  if (plan) {
    const rows = [
      [t('publishers.new'), plan.add.length],
      [t('publishers.updated'), plan.update.length],
      [t('publishers.unchanged'), plan.unchanged],
      ...(source === 'backup'
        ? ([[t('publishers.skipped'), plan.skipped]] as const)
        : []),
    ] as const;
    return (
      <Dialog open={open} onClose={close} title={t('publishers.import')}>
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
            label={t(
              source === 'backup'
                ? 'publishers.removeMissingBackup'
                : 'publishers.removeMissingList',
              { names: count(plan.missing.length, 'names') }
            )}
            labelDescription={t('publishers.removeMissingText')}
          />
        )}
        <DialogActions>
          <Button variant="secondary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="main" disabled={busy} onClick={confirm}>
            {t('publishers.importButton')}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('publishers.import')}
      description={t('publishers.importText')}
    >
      <Stack spacing="8px" sx={{ width: '100%' }}>
        <Typography className="h4">{t('publishers.fromBackup')}</Typography>
        <Typography className="body-small-regular" color="var(--grey-400)">
          {t('publishers.fromBackupText')}
        </Typography>
        <Button variant="tertiary" onClick={() => fileInput.current?.click()}>
          {t('publishers.chooseBackup')}
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
        <Typography className="h4">{t('publishers.paste')}</Typography>
        <TextField
          label={t('publishers.onePerLine')}
          multiline
          minRows={3}
          value={list}
          onChange={(event) => setList(event.target.value)}
        />
      </Stack>
      <DialogActions>
        <Button variant="secondary" onClick={close}>
          {t('common.cancel')}
        </Button>
        <Button variant="main" disabled={!list.trim()} onClick={planList}>
          {t('common.continue')}
        </Button>
      </DialogActions>
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
  const [busy, setBusy] = useState(false);

  if (person !== shown) {
    setShown(person);
    setName(existing?.name ?? '');
    setGroup(existing?.group ?? false);
  }

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await writeRows([
        {
          table: PEOPLE,
          id: existing?.id ?? crypto.randomUUID(),
          fields: { name: trimmed, group },
        },
      ]);
      await loadPeople();
      onClose();
    } catch (error) {
      notify(t('common.somethingWrong'), String(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!person}
      onClose={onClose}
      title={existing ? t('publishers.edit') : t('publishers.add')}
    >
      <TextField
        label={t('publishers.name')}
        value={name}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && save()}
      />
      <SwitchWithLabel
        label={t('publishers.group')}
        helper={t('publishers.groupText')}
        checked={group}
        onChange={setGroup}
      />
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="main" disabled={!name.trim() || busy} onClick={save}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// the settings page names it; it adds its own Import and Add buttons
const Publishers = ({ title }: { title: NavBarOptionsType }) => {
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
    const ok = await confirm({
      title: t('publishers.removeTitle', { name: person.name }),
      description: t('publishers.removeText'),
      action: t('common.remove'),
    });
    if (!ok) return;
    play('remove');
    try {
      await writeRows([{ table: PEOPLE, id: person.id, deleted: true }]);
      await loadPeople();
    } catch (error) {
      notify(t('common.somethingWrong'), String(error), 'error');
    }
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
                color="error"
                edge="end"
                aria-label={t('publishers.removeLabel', { name: person.name })}
                onClick={(event) => {
                  event.stopPropagation();
                  remove(person);
                }}
              >
                <IconDelete color="var(--red-main)" />
              </IconButton>
            </Box>
          ))}
        </Stack>
      </CardSection>
    );

  return (
    <>
      <PageTitle
        {...title}
        buttons={
          <NavBarButtonGroup>
            <NavBarButton
              text={t('publishers.importButton')}
              icon={<IconImportExport />}
              onClick={() => setImportOpen(true)}
            />
            <NavBarButton
              text={t('publishers.addButton')}
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
            title={t('publishers.none')}
            description={t('publishers.noneText')}
          />
          <Actions
            actions={[
              {
                label: t('publishers.import'),
                kind: 'main',
                onClick: () => setImportOpen(true),
              },
            ]}
          />
        </CardSection>
      ) : (
        <>
          <SearchBar
            placeholder={t('publishers.search')}
            value={search}
            onSearch={setSearch}
          />
          {section(t('publishers.groups'), groups)}
          {section(t('publishers.publishers'), publishers)}
          {groups.length + publishers.length === 0 && (
            <Typography className="body-regular" color="var(--grey-400)">
              {t('publishers.noMatch')}
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
    </>
  );
};

export default Publishers;
