import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Box, Stack } from '@mui/material';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { invoke, listen } from '../../native';
import { Touched } from '../useNearby';
import { Actions, Avatar } from './parts';
import { count, when } from './text';

type Entry = {
  at: number;
  peer: string;
  name: string;
  sent: number;
  received: number;
  items: Record<string, number> | null;
  detail: { received?: Touched[]; sent?: Touched[] } | null;
};

const KINDS: Record<string, string> = {
  details: 'details',
  assignment: 'assignment',
  'do-not-call': 'do not call',
};

const summary = (entry: Entry) => {
  const people = entry.items?.people ?? 0;
  const got = entry.detail?.received?.length ?? 0;
  const parts = [
    got > 0 && `got ${count(got, 'territory', 'territories')}`,
    people > 0 && `${count(people, 'name', 'names')}`,
    entry.sent > 0 && `sent ${count(entry.sent, 'change', 'changes')}`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'nothing new';
};

/** One territory a sync changed: its number and what, linking to it. */
const TerritoryLink = ({ item }: { item: Touched }) => {
  const navigate = useNavigate();
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
        backgroundColor: 'var(--accent-150)',
        cursor: 'pointer',
        '&:hover': { backgroundColor: 'var(--accent-200)' },
      }}
    >
      <Typography className="body-small-semibold" color="var(--accent-main)">
        {item.number}
      </Typography>
      <Typography className="label-small-regular" color="var(--accent-400)">
        {item.what.map((what) => KINDS[what] ?? what).join(', ')}
      </Typography>
    </Box>
  );
};

const Territories = ({ label, list }: { label: string; list?: Touched[] }) =>
  list?.length ? (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Typography className="label-small-regular" color="var(--grey-400)">
        {label}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {list.map((item) => (
          <TerritoryLink key={item.id} item={item} />
        ))}
      </Box>
    </Box>
  ) : null;

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
        title="Sync history"
        description="Tap a territory number to open it."
      />
      <Stack spacing="16px">
        {shown.map((entry) => (
          <Box
            key={`${entry.at}-${entry.peer}`}
            sx={{ display: 'flex', gap: '12px' }}
          >
            <Avatar name={entry.name || '?'} />
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
                  {entry.name || 'Unnamed phone'}
                </Typography>
                <Typography
                  className="label-small-regular"
                  color="var(--grey-400)"
                >
                  {when(entry.at)} · {summary(entry)}
                </Typography>
              </Box>
              <Territories label="Came in" list={entry.detail?.received} />
              <Territories label="You sent" list={entry.detail?.sent} />
            </Box>
          </Box>
        ))}
      </Stack>
      {entries.length > 5 && (
        <Actions
          actions={[
            {
              label: all ? 'Show less' : `Show all ${entries.length}`,
              kind: 'tertiary',
              onClick: () => setAll(!all),
            },
          ]}
        />
      )}
    </CardSection>
  );
};

export default History;
