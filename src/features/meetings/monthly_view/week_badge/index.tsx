import { Box, IconButton } from '@mui/material';
import IconLoading from '@components/icon_loading';
import Tooltip from '@components/tooltip';
import Typography from '@components/typography';
import { IconGenerate } from '@components/icons';
import useAppTranslation from '@hooks/useAppTranslation';
import { WeekBadgeType } from './index.types';
import useWeekBadge from './useWeekBadge';

const ICON_SIZE = 24;
const ICON_BUTTON_SIZE = 32;

const WeekBadge = (props: WeekBadgeType) => {
  const { t } = useAppTranslation();
  const { isProcessing, handleAutofill } = useWeekBadge(props.week);

  return (
    <Box
      sx={{
        flex: '1',
        height: '32px',
        padding: '4px',
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'var(--accent-150)',
        borderRadius: 'var(--radius-s)',
      }}
    >
      {props.week ? (
        <>
          <Box sx={{ width: ICON_BUTTON_SIZE, flexShrink: 0 }} />
          <Typography
            color={'var(--accent-dark)'}
            className="h4"
            sx={{ flex: 1, textAlign: 'center' }}
          >
            {props.text}
          </Typography>
          <Tooltip
            title={t('tr_autofillThisWeek')}
            show={!isProcessing}
            placement="top"
          >
            <IconButton
              onClick={handleAutofill}
              disabled={isProcessing}
              aria-label={t('tr_autofillThisWeek')}
              sx={{ padding: '4px' }}
            >
              {isProcessing ? (
                <IconLoading
                  width={ICON_SIZE}
                  height={ICON_SIZE}
                  color="var(--accent-dark)"
                />
              ) : (
                <IconGenerate
                  width={ICON_SIZE}
                  height={ICON_SIZE}
                  color="var(--accent-dark)"
                />
              )}
            </IconButton>
          </Tooltip>
        </>
      ) : (
        <Typography
          color={'var(--accent-dark)'}
          className="h4"
          sx={{ flex: 1, textAlign: 'center' }}
        >
          {props.text}
        </Typography>
      )}
    </Box>
  );
};

export default WeekBadge;
