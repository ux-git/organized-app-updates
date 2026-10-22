import { Box } from '@mui/material';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { t } from '../../i18n';
import { title, when } from './text';
import useWaiting, { seconds, what } from './useWaiting';

const SHOWN = 50;

/** The records counted as waiting to sync, newest first. */
const Waiting = ({ pending }: { pending: number }) => {
  const records = useWaiting(pending);

  if (!records.length) return null;

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
