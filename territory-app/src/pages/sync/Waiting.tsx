import { useState } from 'react';
import { Box, ButtonBase, Collapse } from '@mui/material';
import { IconExpand } from '@icons/index';
import Badge from '@components/badge';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionDescription,
  CardSectionTitle,
} from '@features/congregation/settings/shared_styles';
import { t } from '../../i18n';
import { title, when } from './text';
import useWaiting, { seconds, what } from './useWaiting';

const SHOWN = 50;

/** The records counted as waiting to sync, newest first. */
const Waiting = ({ pending }: { pending: number }) => {
  const records = useWaiting(pending);
  // a long list would push the rest of the sync page down
  const [open, setOpen] = useState(false);

  if (!records.length) return null;

  return (
    <CardSection>
      <ButtonBase
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          textAlign: 'left',
          borderRadius: 'var(--radius-m)',
        }}
      >
        <Box
          sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CardSectionTitle>{t('sync.waitingTitle')}</CardSectionTitle>
            <Badge size="small" color="accent" text={String(records.length)} />
          </Box>
          <CardSectionDescription content={t('sync.waitingText')} />
        </Box>
        <IconExpand
          color="var(--accent-main)"
          sx={{
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease',
          }}
        />
      </ButtonBase>
      <Collapse in={open} sx={{ marginTop: open ? undefined : '-24px' }}>
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
      </Collapse>
    </CardSection>
  );
};

export default Waiting;
