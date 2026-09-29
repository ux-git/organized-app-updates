import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box, Stack } from '@mui/material';
import { IconAdd, IconDelete, IconImportExport } from '@icons/index';
import Button from '@components/button';
import Checkbox from '@components/checkbox';
import { NavBarOptionsType } from '@definition/app';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import IconButton from '@components/icon_button';
import InfoNote from '@components/info_note';
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
import { territoriesState } from '@states/territories';
import {
  applyImport,
  ImportPlan,
  planImport,
  readBackup,
  readList,
} from '../people';
import {
  loadPeople,
  PEOPLE,
  Person,
  renameOnTerritories,
  sameName,
  writeRows,
} from '../persistence';
import { linkedDevices, linksState } from '../profiles';
import { play, toggled } from '../haptics';
import { confirm } from './confirm';
import { list, t } from '../i18n';
import { count, notify } from './sync/text';
import { Actions, Avatar } from './sync/parts';
import usePeople from './usePeople';

const failed = (error: unknown) => {
  console.error('publishers: saving failed', error);
  notify(t('common.somethingWrong'), t('common.notSaved'), 'error');
};

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
      const { incoming, skipped, campaigns } = readBackup(await file.text());
      setSource('backup');
      setPlan(planImport(people, incoming, skipped, campaigns));
    } catch (error) {
      console.error('publishers: reading the backup failed', error);
      notify(t('common.somethingWrong'), t('publishers.notBackup'), 'error');
    }
  };

  const confirm = async () => {
    if (!plan || busy) return;
    setBusy(true);
    try {
      await applyImport(plan, removeMissing);
      notify(
        t('publishers.imported'),
        [
          t('publishers.importedText', {
            added: count(plan.add.length, 'names'),
            updated: count(plan.update.length, 'names'),
          }),
          plan.campaigns.length > 0 &&
            t('publishers.importedCampaigns', {
              campaigns: count(plan.campaigns.length, 'campaigns'),
            }),
        ]
          .filter(Boolean)
          .join(' ')
      );
      close();
    } catch (error) {
      failed(error);
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
        ? ([
            [t('publishers.skipped'), plan.skipped],
            [t('publishers.campaigns'), plan.campaigns.length],
          ] as const)
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
            onChange={(_, checked) => setRemoveMissing(toggled(checked))}
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
  people,
  onClose,
}: {
  person: Person | 'new' | null;
  people: Person[];
  onClose: VoidFunction;
}) => {
  const existing = person && person !== 'new' ? person : null;
  const links = useAtomValue(linksState);
  const [name, setName] = useState('');
  const [group, setGroup] = useState(false);
  const [shown, setShown] = useState<typeof person>(null);
  const [busy, setBusy] = useState(false);

  if (person !== shown) {
    setShown(person);
    setName(existing?.name ?? '');
    setGroup(existing?.group ?? false);
  }

  // territories keep names, so two people can't share one
  const duplicate = people.some(
    (other) =>
      other.id !== existing?.id && sameName(other.name) === sameName(name)
  );
  const linked =
    existing && !existing.group && group
      ? linkedDevices(existing.id, links)
      : 0;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || duplicate || busy) return;
    setBusy(true);
    try {
      await writeRows([
        {
          table: PEOPLE,
          id: existing?.id ?? crypto.randomUUID(),
          fields: { name: trimmed, group },
        },
      ]);
      if (existing && existing.name !== trimmed) {
        renameOnTerritories(new Map([[existing.name, trimmed]]));
      }
      await loadPeople();
      onClose();
    } catch (error) {
      failed(error);
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
        error={duplicate}
        helperText={duplicate ? t('publishers.duplicate') : undefined}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && save()}
      />
      <SwitchWithLabel
        label={t('publishers.group')}
        helper={t('publishers.groupText')}
        checked={group}
        onChange={(on) => setGroup(toggled(on))}
        inputProps={{ 'aria-label': t('publishers.group') }}
      />
      {linked > 0 && (
        <InfoNote
          message={t('publishers.linkedDevices', {
            devices: count(linked, 'phones'),
          })}
        />
      )}
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="main"
          disabled={!name.trim() || duplicate || busy}
          onClick={save}
        >
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// the settings page names it; it adds its own Import and Add buttons
const Publishers = ({ title }: { title: NavBarOptionsType }) => {
  const people = usePeople();
  const links = useAtomValue(linksState);
  const territories = useAtomValue(territoriesState);
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
    const linked = person.group ? 0 : linkedDevices(person.id, links);
    const held = territories
      .filter((territory) => territory.holder === person.name)
      .map((territory) => territory.number)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const ok = await confirm({
      title: t('publishers.removeTitle', { name: person.name }),
      description: [
        held.length > 0 && t('publishers.holds', { territories: list(held) }),
        t('publishers.removeText'),
        linked > 0 &&
          t('publishers.linkedDevices', { devices: count(linked, 'phones') }),
      ]
        .filter(Boolean)
        .join(' '),
      action: t('common.remove'),
    });
    if (!ok) return;
    play('remove');
    try {
      await writeRows([{ table: PEOPLE, id: person.id, deleted: true }]);
      await loadPeople();
    } catch (error) {
      failed(error);
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
      <NameDialog
        person={editing}
        people={people}
        onClose={() => setEditing(null)}
      />
    </>
  );
};

export default Publishers;
