import { Box } from '@mui/material';
import { useAppTranslation } from '@hooks/index';
import LocalSync from '@features/local_sync';
import PageTitle from '@components/page_title';

const LocalSyncPage = () => {
  const { t } = useAppTranslation();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PageTitle title={t('tr_localSync')} />

      <Box
        sx={{
          backgroundColor: 'var(--white)',
          border: '1px solid var(--accent-300)',
          borderRadius: 'var(--radius-xl)',
          padding: '24px',
        }}
      >
        <LocalSync />
      </Box>
    </Box>
  );
};

export default LocalSyncPage;
