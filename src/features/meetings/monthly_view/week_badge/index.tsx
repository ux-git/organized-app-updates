import { Box } from '@mui/material';
import IconButton from '@components/icon_button';
import IconLoading from '@components/icon_loading';
import Tooltip from '@components/tooltip';
import Typography from '@components/typography';
import { IconGenerate } from '@components/icons';
import useAppTranslation from '@hooks/useAppTranslation';
import { WeekBadgeType } from './index.types';
import useWeekBadge from './useWeekBadge';

const WeekBadge = (props: WeekBadgeType) => {
  const { t } = useAppTranslation();
  const { isProcessing, handleAutofill } = useWeekBadge(props.week);

  return (
    <Box
      sx={{
        flex: '1',
        height: '32px',
        padding: '6px 8px 6px 8px',
        gap: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--accent-150)',
        borderRadius: 'var(--radius-s)',
        position: 'relative',
      }}
    >
      <Typography color={'var(--accent-dark)'} className="h4">
        {props.text}
      </Typography>
      {props.week && (
        <Tooltip
          title={t('tr_autofillThisWeek')}
          show={!isProcessing}
          placement="top"
        >
          <IconButton
            onClick={handleAutofill}
            disabled={isProcessing}
            aria-label={t('tr_autofillThisWeek')}
            sx={{
              padding: '4px',
              position: 'absolute',
              right: '4px',
            }}
          >
            {isProcessing ? (
              <IconLoading width={16} height={16} color="var(--accent-dark)" />
            ) : (
              <IconGenerate color="var(--accent-dark)" />
            )}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export default WeekBadge;
