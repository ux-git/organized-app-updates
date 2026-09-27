import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAtomValue } from 'jotai';
import { Box, Stack } from '@mui/material';
import Button from '@components/button';
import Typography from '@components/typography';
import { territoriesState } from '@states/territories';
import { assignmentIssues } from '@features/territories/helpers';
import {
  CardSection,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { invoke, listen } from '../../native';
import { Touched } from '../useNearby';
import { Avatar } from './parts';
import { list, t } from '../../i18n';
import { count, when } from './text';

type Entry = {
  at: number;
  peer: string;
  name: string;
  sent: number;
  received: number;
  items: Record<string, number> | null;
  detail: { received?: Touched[]; sent?: Touched[]; removed?: string[] } | null;
};

const KINDS: Record<string, string> = {
  created: 'history.created',
  deleted: 'history.deleted',
  assigned: 'history.assigned',
  returned: 'history.returned',
  'assignment-removed': 'history.assignmentRemoved',
  border: 'history.border',
  details: 'history.details',
  'dnc-added': 'history.dncAdded',
  'dnc-changed': 'history.dncChanged',
  'dnc-removed': 'history.dncRemoved',
  // older syncs were logged with these
  assignment: 'history.assignment',
  'do-not-call': 'history.doNotCall',
};

const summary = (entry: Entry) => {
  const people = entry.items?.people ?? 0;
  const got = entry.detail?.received?.length ?? 0;
  const parts = [
    got > 0 && t('history.got', { territories: count(got, 'territories') }),
    people > 0 && count(people, 'names'),
    entry.sent > 0 &&
      t('history.sent', { changes: count(entry.sent, 'changes') }),
    !!entry.detail?.removed?.length &&
      t('history.removed', { names: list(entry.detail.removed) }),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : t('history.nothing');
};

/** One territory a sync changed: its number and what, linking to it. */
const TerritoryLink = ({ item }: { item: Touched }) => {
  const navigate = useNavigate();
  // dates that can't be right, e.g. from the other device, show in red
  const warn = !!useAtomValue(territoriesState)
    .find((territory) => territory.id === item.id)
    ?.assignments.some((assignment) => assignmentIssues(assignment).length);
  return (
    <Box
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/territories/${item.id}`)}
      onKeyDown={(event) =>
        event.key === 'Enter' && navigate(`/territories/${item.id}`)
      }
      sx={{
        display: 'inline-flex',
        gap: '6px',
        alignItems: 'baseline',
        padding: '4px 10px',
        borderRadius: 'var(--radius-m)',
        backgroundColor: warn ? 'var(--red-secondary)' : 'var(--accent-150)',
        cursor: 'pointer',
        '&:hover': {
          backgroundColor: warn ? 'var(--red-secondary)' : 'var(--accent-200)',
        },
      }}
    >
      <Typography
        className="body-small-semibold"
        color={warn ? 'var(--red-dark)' : 'var(--accent-main)'}
        sx={{ whiteSpace: 'nowrap' }}
      >
        {t('history.number', { number: item.number })}
      </Typography>
      <Typography
        className="label-small-regular"
        color={warn ? 'var(--red-main)' : 'var(--accent-400)'}
      >
        {[
          ...item.what.map((what) => (KINDS[what] ? t(KINDS[what]) : what)),
          warn && t('history.dates'),
        ]
          .filter(Boolean)
          .join(', ')}
      </Typography>
    </Box>
  );
};

const MoreToggle = ({
  open,
  total,
  onClick,
}: {
  open: boolean;
  total: number;
  onClick: VoidFunction;
}) => (
  <Button
    variant="small"
    disableAutoStretch
    onClick={onClick}
    sx={{ alignSelf: 'flex-start', marginLeft: '-8px' }}
  >
    {open ? t('history.showLess') : t('history.showAll', { count: total })}
  </Button>
);

const SHOWN = 8;
// three rows of 24px chips: long descriptions take a row each on a phone
const ROWS = 'calc(3 * 24px + 2 * 6px)';

const Territories = ({ label, list }: { label: string; list?: Touched[] }) => {
  const total = useAtomValue(territoriesState).length;
  const [open, setOpen] = useState(false);
  if (!list?.length) return null;

  const long = list.length > SHOWN;
  // a first sync brings every territory: one line says it
  const everything = long && total > 0 && list.length >= total;
  const shown = open ? list : everything ? [] : list.slice(0, SHOWN);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Typography className="label-small-regular" color="var(--grey-400)">
        {label}
      </Typography>
      {everything && !open && (
        <Typography className="body-small-semibold" color="var(--accent-main)">
          {t('history.allTerritories', { count: list.length })}
        </Typography>
      )}
      {shown.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            ...(long && !open && { maxHeight: ROWS, overflow: 'hidden' }),
          }}
        >
          {shown.map((item) => (
            <TerritoryLink key={item.id} item={item} />
          ))}
        </Box>
      )}
      {long && (
        <MoreToggle
          open={open}
          total={list.length}
          onClick={() => setOpen(!open)}
        />
      )}
    </Box>
  );
};

/** The latest syncs: with whom, when, and which territories changed. */
const History = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [all, setAll] = useState(false);

  const refresh = useCallback(() => {
    invoke<Entry[]>('sync_log')
      .then(setEntries)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const stops = [listen('store-changed', refresh), listen('synced', refresh)];
    return () => stops.forEach((stop) => stop.then((unlisten) => unlisten()));
  }, [refresh]);

  if (!entries.length) return null;
  const shown = all ? entries : entries.slice(0, 5);

  return (
    <CardSection>
      <CardSectionHeader
        title={t('history.title')}
        description={t('history.text')}
      />
      <Stack spacing="16px">
        {shown.map((entry) => (
          <Box
            key={`${entry.at}-${entry.peer}`}
            sx={{ display: 'flex', gap: '12px' }}
          >
            <Avatar name={entry.name || '?'} id={entry.peer} />
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <Box>
                <Typography className="body-regular">
                  {entry.name || t('common.unnamedPhone')}
                </Typography>
                <Typography
                  className="label-small-regular"
                  color="var(--grey-400)"
                >
                  {when(entry.at)} · {summary(entry)}
                </Typography>
              </Box>
              <Territories
                label={t('history.cameIn')}
                list={entry.detail?.received}
              />
              <Territories
                label={t('history.youSent')}
                list={entry.detail?.sent}
              />
            </Box>
          </Box>
        ))}
      </Stack>
      {entries.length > 5 && (
        <MoreToggle
          open={all}
          total={entries.length}
          onClick={() => setAll(!all)}
        />
      )}
    </CardSection>
  );
};

export default History;
