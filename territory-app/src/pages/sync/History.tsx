import { useCallback, useEffect, useState } from 'react';
import { Box, Stack } from '@mui/material';
import Button from '@components/button';
import {
  CardSection,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { invoke, listen } from '../../native';
import { PhoneRow } from './parts';
import { count, describeItems, when } from './text';

type Entry = {
  at: number;
  peer: string;
  name: string;
  sent: number;
  received: number;
  items: Record<string, number> | null;
};

const summary = (entry: Entry) => {
  const got = describeItems(entry.items);
  const parts = [
    got && `got ${got}`,
    entry.sent > 0 && `sent ${count(entry.sent, 'change', 'changes')}`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'nothing new';
};

/** The latest syncs, so it's clear something happened, and when. */
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
  const shown = all ? entries : entries.slice(0, 3);

  return (
    <CardSection>
      <CardSectionHeader title="Recent syncs" />
      <Stack spacing="4px">
        {shown.map((entry) => (
          <PhoneRow
            key={`${entry.at}-${entry.peer}`}
            name={entry.name || 'Unnamed phone'}
            detail={`${when(entry.at)} · ${summary(entry)}`}
          />
        ))}
      </Stack>
      {entries.length > 3 && (
        <Box>
          <Button
            variant="tertiary"
            disableAutoStretch
            onClick={() => setAll(!all)}
          >
            {all ? 'Show less' : 'Show all'}
          </Button>
        </Box>
      )}
    </CardSection>
  );
};

export default History;
