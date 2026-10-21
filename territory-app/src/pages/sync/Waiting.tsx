import { useCallback, useEffect, useState } from 'react';
import { Box } from '@mui/material';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { invoke, listen } from '../../native';
import { list, t } from '../../i18n';
import { Described, fieldLabel, title, when } from './text';

type Item = Described & {
  record: string;
  fields: string[];
  stamp: string;
  added: boolean;
  deleted: boolean;
};

const SHOWN = 50;

const what = (item: Item) => {
  if (item.deleted) return t('history.deleted');
  if (item.added) return t('changes.added');
  return list(item.fields.map(fieldLabel));
};

// a stamp starts with its time in milliseconds, as 13 hex digits
const seconds = (stamp: string) => parseInt(stamp.slice(0, 13), 16) / 1000;

/** The records counted as waiting to sync, newest first. */
const Waiting = ({ pending }: { pending: number }) => {
  const [records, setRecords] = useState<Item[]>([]);

  const refresh = useCallback(() => {
    invoke<Item[]>('unsynced_records')
      .then(setRecords)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const stop = listen('store-changed', refresh);
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }, [refresh, pending]);

  if (pending <= 0 || !records.length) return null;

  return (
    <CardSection>
      <CardSectionHeader
        title={t('sync.waitingTitle')}
        description={t('sync.waitingText')}
      />
      <CardSectionContent spacing="8px" divider={undefined}>
        {records.slice(0, SHOWN).map((record) => {
          const detail = what(record);
          return (
            <Box
              key={`${record.table}/${record.record}`}
              sx={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-l)',
                border: '1px solid var(--accent-200)',
                backgroundColor: 'var(--white)',
              }}
            >
              <Typography className="body-small-semibold">
                {detail ? `${title(record)} · ${detail}` : title(record)}
              </Typography>
              <Typography
                className="label-small-regular"
                color="var(--grey-400)"
              >
                {when(seconds(record.stamp))}
              </Typography>
            </Box>
          );
        })}
        {records.length > SHOWN && (
          <Typography className="label-small-regular" color="var(--grey-400)">
            {t('sync.waitingMore', { count: records.length - SHOWN })}
          </Typography>
        )}
      </CardSectionContent>
    </CardSection>
  );
};

export default Waiting;
