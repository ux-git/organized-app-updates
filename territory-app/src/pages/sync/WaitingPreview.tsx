import { useNavigate } from 'react-router';
import { Box, ButtonBase } from '@mui/material';
import { IconChevronRight, IconCloudUpload } from '@icons/index';
import Typography from '@components/typography';
import { t } from '../../i18n';
import { time, title } from './text';
import { seconds, what, WaitingItem } from './useWaiting';
import KindIcon from './KindIcon';
import { kindOf } from './waitingKinds';

const SHOWN = 3;

/** On the dashboard: this device's own edits no paired device has yet. */
const WaitingPreview = ({ mine }: { mine: WaitingItem[] }) => {
  const navigate = useNavigate();

  if (!mine.length) return null;

  return (
    <ButtonBase
      onClick={() => navigate('/settings/waiting')}
      aria-label={t('waiting.open')}
      sx={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        margin: '4px 0 8px',
        padding: '12px',
        borderRadius: 'var(--radius-l)',
        backgroundColor: 'var(--accent-100)',
        border: '1px solid var(--accent-200)',
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
        '&:hover': {
          backgroundColor: 'var(--accent-150)',
          borderColor: 'var(--accent-300)',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <IconCloudUpload color="var(--accent-main)" width={20} height={20} />
        <Typography
          className="body-small-semibold"
          color="var(--accent-dark)"
          sx={{ flex: 1 }}
        >
          {t('waiting.summary', { count: mine.length })}
        </Typography>
        <IconChevronRight color="var(--accent-main)" width={20} height={20} />
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          marginTop: '10px',
        }}
      >
        {mine.slice(0, SHOWN).map((item) => {
          const detail = what(item);
          return (
            <Box
              key={`${item.table}/${item.record}`}
              sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <KindIcon kind={kindOf(item.table)} size={16} />
              <Typography
                className="label-small-regular"
                color="var(--black)"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {title(item)}
                {detail && (
                  <Box component="span" sx={{ color: 'var(--grey-400)' }}>
                    {` · ${detail}`}
                  </Box>
                )}
              </Typography>
              <Typography
                className="label-small-regular"
                color="var(--grey-400)"
              >
                {time(new Date(seconds(item.stamp) * 1000))}
              </Typography>
            </Box>
          );
        })}
        {mine.length > SHOWN && (
          <Typography
            className="label-small-regular"
            color="var(--accent-main)"
          >
            {t('sync.waitingMore', { count: mine.length - SHOWN })}
          </Typography>
        )}
      </Box>
    </ButtonBase>
  );
};

export default WaitingPreview;
