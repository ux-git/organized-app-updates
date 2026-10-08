import Badge from '@components/badge';
import { exportFile } from '@services/files/export';
import importExample from '../publisher-import-example.json';
import { tx } from '@services/i18n/translation';
import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box, Menu, Stack } from '@mui/material';
import { useNavigate, useParams } from 'react-router';
import MenuItem from '@components/menuitem';
import WaitingLoader from '@components/waiting_loader';
import PublisherTerritories from './PublisherTerritories';
import { sortPublishers, type PublisherSort } from '../publisherView';
import {
  IconAdd,
  IconChevronRight,
  IconDelete,
  IconImportExport,
  IconSortDown,
} from '@icons/index';
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
import EditorHeader from '@features/territories/components/editor_header';
import { territoriesState } from '@states/territories';
import { HOVER_ACTIONS } from '@features/territories/components/table_styles';
import { useBreakpoints, useAppTranslation } from '@hooks/index';
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
import { activeFor } from '../publisherChanges';
import { toggled } from '../haptics';
import ManagePublisher from './ManagePublisher';
import { t } from '../i18n';
import { count, notify } from './sync/text';
import { Actions, Avatar } from './sync/parts';
import { removeWithUndo, usePeopleList } from './usePeople';

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

  const downloadExample = async () => {
    try {
      await exportFile(
        new Blob([JSON.stringify(importExample, null, 2) + '\n'], {
          type: 'application/json',
        }),
        'publishers-example.json'
      );
    } catch {
      notify(
        t('common.somethingWrong'),
        t('publishers.exampleFailed'),
        'error'
      );
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
        <Button variant="tertiary" onClick={downloadExample}>
          {t('publishers.example')}
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
  onRemove,
  onMerge,
}: {
  person: Person | 'new' | null;
  people: Person[];
  onClose: VoidFunction;
  onRemove?: VoidFunction;
  onMerge?: VoidFunction;
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
      header={
        <EditorHeader
          title={existing ? t('publishers.edit') : t('publishers.add')}
          onDelete={existing ? onRemove : undefined}
          deleteLabel={t('common.remove')}
        />
      }
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
      {existing && (
        <Button variant="tertiary" onClick={onMerge} disabled={busy}>
          {tx('Merge duplicate')}
        </Button>
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
  const { tablet688Up } = useBreakpoints();
  const { people, loading } = usePeopleList();
  const { t: translate, i18n } = useAppTranslation();
  const navigate = useNavigate();
  const { publisherId } = useParams();
  const person = people.find((item) => item.id === publisherId);
  const [sort, setSort] = useState<PublisherSort>('first');
  const [sortMenu, setSortMenu] = useState<HTMLElement | null>(null);

  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Person | 'new' | null>(null);

  const [groups, publishers] = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const shown = sortPublishers(
      people.filter((person) =>
        person.name.toLocaleLowerCase().includes(query)
      ),
      sort,
      i18n.language === 'deu' ? 'de' : 'en'
    );
    return [
      shown.filter((person) => person.group),
      shown.filter((person) => !person.group),
    ];
  }, [people, search, sort, i18n.language]);

  const [managing, setManaging] = useState<{
    person: Person;
    mode: 'remove' | 'merge';
  } | null>(null);
  const territories = useAtomValue(territoriesState);
  // with no territory to hand on, there is nothing to ask: undo is the safety net
  const remove = (person: Person) => {
    setEditing(null);
    if (territories.some((item) => activeFor(item, person.name).length)) {
      setManaging({ person, mode: 'remove' });
      return;
    }
    removeWithUndo(person, { resolutions: {} }).catch((error: Error) =>
      notify(t('common.somethingWrong'), tx(error.message), 'error')
    );
  };

  const section = (title: string, list: Person[], sortable = false) =>
    list.length > 0 && (
      <CardSection>
        <Stack direction="row" sx={{ alignItems: 'center', gap: '8px' }}>
          <Typography component="h2" className="h2">
            {title}
          </Typography>
          <Badge size="small" color="accent" text={String(list.length)} />
          {sortable && (
            <IconButton
              aria-label={translate('tr_publisherSort')}
              aria-haspopup="menu"
              aria-expanded={!!sortMenu}
              onClick={(event) => setSortMenu(event.currentTarget)}
            >
              <IconSortDown color="var(--black)" />
            </IconButton>
          )}
        </Stack>
        <Stack spacing="2px">
          {list.map((person) => (
            <Box
              key={person.id}
              role="button"
              tabIndex={0}
              onClick={() =>
                navigate(
                  `/settings/publishers/${encodeURIComponent(person.id)}`
                )
              }
              onKeyDown={(event) => {
                if (
                  event.target === event.currentTarget &&
                  (event.key === 'Enter' || event.key === ' ')
                ) {
                  event.preventDefault();
                  navigate(
                    `/settings/publishers/${encodeURIComponent(person.id)}`
                  );
                }
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '6px 8px',
                marginInline: '-8px',
                borderRadius: 'var(--radius-l)',
                cursor: 'pointer',
                '&:hover': { backgroundColor: 'var(--accent-150)' },
                ...HOVER_ACTIONS,
              }}
            >
              <Avatar name={person.name} />
              <Typography
                className="body-regular"
                sx={{ flex: 1, minWidth: 0 }}
              >
                {person.name}
              </Typography>
              {/* on a phone the row is the button; removing waits in the dialog */}
              {tablet688Up ? (
                <IconButton
                  className="row-actions"
                  color="error"
                  edge="end"
                  aria-label={t('publishers.removeLabel', {
                    name: person.name,
                  })}
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(person);
                  }}
                >
                  <IconDelete color="var(--red-main)" />
                </IconButton>
              ) : (
                <IconChevronRight
                  color="var(--grey-350)"
                  width={20}
                  height={20}
                  sx={{ flexShrink: 0 }}
                />
              )}
            </Box>
          ))}
        </Stack>
      </CardSection>
    );

  return (
    <>
      {publisherId ? (
        person ? (
          <PublisherTerritories
            person={person}
            onEdit={() => setEditing(person)}
          />
        ) : loading ? (
          <WaitingLoader type="lottie" />
        ) : (
          <>
            <PageTitle
              {...title}
              onBack={() => navigate('/settings/publishers')}
            />
            <InfoNote message={translate('tr_publisherNotFound')} />
          </>
        )
      ) : (
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
              <Menu
                anchorEl={sortMenu}
                open={!!sortMenu}
                onClose={() => setSortMenu(null)}
              >
                {(['first', 'last'] as const).map((value) => (
                  <MenuItem
                    key={value}
                    selected={sort === value}
                    onClick={() => {
                      setSort(value);
                      setSortMenu(null);
                    }}
                  >
                    {translate(
                      value === 'first'
                        ? 'tr_publisherSortFirst'
                        : 'tr_publisherSortLast'
                    )}
                  </MenuItem>
                ))}
              </Menu>
              {section(t('publishers.groups'), groups)}
              {section(t('publishers.publishers'), publishers, true)}
              {groups.length + publishers.length === 0 && (
                <Typography className="body-regular" color="var(--grey-400)">
                  {t('publishers.noMatch')}
                </Typography>
              )}
            </>
          )}
        </>
      )}
      {managing && (
        <ManagePublisher
          person={managing.person}
          initialMode={managing.mode}
          people={people}
          onClose={() => setManaging(null)}
        />
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
        onMerge={
          editing && editing !== 'new'
            ? () => {
                setManaging({ person: editing, mode: 'merge' });
                setEditing(null);
              }
            : undefined
        }
        onRemove={
          editing && editing !== 'new' ? () => remove(editing) : undefined
        }
      />
    </>
  );
};

export default Publishers;
