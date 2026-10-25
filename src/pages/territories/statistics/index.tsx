import { Box } from '@mui/material';
import {
  useAppTranslation,
  useBreakpoints,
  useUpNavigation,
} from '@hooks/index';
import PageTitle from '@components/page_title';
import TerritoriesStatistics from '@features/territories/statistics';

const TerritoryStatisticsPage = () => {
  const { t } = useAppTranslation();

  const { goUp } = useUpNavigation();
  const { tablet688Up } = useBreakpoints();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        paddingBottom: tablet688Up ? '0px' : '60px',
      }}
    >
      <PageTitle
        title={t('tr_territoryTerritoryCoverageStatistics')}
        onBack={() => goUp('/')}
      />

      <TerritoriesStatistics />
    </Box>
  );
};

export default TerritoryStatisticsPage;
