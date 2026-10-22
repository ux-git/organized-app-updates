import { Box, Stack } from '@mui/material';
import { IconImportJson, IconShare } from '@components/icons';
import { useAppTranslation } from '@hooks/index';
import { LocalOnlyCategory } from '@definition/settings';
import useLocalSync from './useLocalSync';
import Button from '@components/button';
import Typography from '@components/typography';
import WaitingLoader from '@components/waiting_loader';

const CATEGORY_LABELS: Record<LocalOnlyCategory, string> = {
  cong_field_service_reports: 'tr_moduleFieldServiceReports',
  branch_field_service_reports: 'tr_branchS1',
  branch_cong_analysis: 'tr_branchS10',
  meeting_attendance: 'tr_moduleMeetingAttendance',
};

const LocalSync = () => {
  const { t } = useAppTranslation();

  const {
    categories,
    isProcessing,
    nearbyAvailable,
    getRootProps,
    getInputProps,
    handleShare,
    handleSyncNearby,
    handlePairNearby,
  } = useLocalSync();

  return (
    <Stack spacing="24px">
      <Stack spacing="8px">
        <Typography className="h3">{t('tr_localSyncWhat')}</Typography>
        <Typography color="var(--grey-400)">
          {categories.length > 0
            ? categories
                .map((category) => t(CATEGORY_LABELS[category]))
                .join(', ')
            : t('tr_localSyncNone')}
        </Typography>
      </Stack>

      {nearbyAvailable && (
        <Stack spacing="8px">
          <Typography className="h3">{t('tr_localSyncNearby')}</Typography>
          <Typography color="var(--grey-400)">
            {t('tr_localSyncNearbyDesc')}
          </Typography>
          <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="main" onClick={handleSyncNearby}>
              {t('tr_localSyncNow')}
            </Button>
            <Button variant="secondary" onClick={handlePairNearby}>
              {t('tr_localSyncPair')}
            </Button>
          </Box>
        </Stack>
      )}

      <Stack spacing="8px">
        <Typography className="h3">{t('tr_localSyncShare')}</Typography>
        <Typography color="var(--grey-400)">
          {t('tr_localSyncShareDesc')}
        </Typography>
        <Box>
          <Button
            variant="main"
            startIcon={<IconShare />}
            disabled={isProcessing || categories.length === 0}
            onClick={handleShare}
          >
            {t('tr_localSyncShareBtn')}
          </Button>
        </Box>
      </Stack>

      <Stack spacing="8px">
        <Typography className="h3">{t('tr_localSyncReceive')}</Typography>
        <Typography color="var(--grey-400)">
          {t('tr_localSyncReceiveDesc')}
        </Typography>

        {isProcessing ? (
          <WaitingLoader />
        ) : (
          <Box
            {...getRootProps()}
            sx={{
              border: '1px dashed var(--accent-dark)',
              borderRadius: '6px',
              minHeight: '120px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              gap: '8px',
              padding: '16px',
              '&:hover': { backgroundColor: 'var(--accent-100)' },
            }}
          >
            <input {...getInputProps()} />
            <IconImportJson color="var(--accent-dark)" />
            <Typography color="var(--accent-dark)">
              {t('tr_localSyncReceiveBtn')}
            </Typography>
          </Box>
        )}
      </Stack>
    </Stack>
  );
};

export default LocalSync;
