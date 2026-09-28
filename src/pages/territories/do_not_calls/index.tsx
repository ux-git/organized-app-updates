import { Box } from '@mui/material';
import { useBreakpoints } from '@hooks/index';
import PageTitle from '@components/page_title';
import TerritoryDoNotCalls from '@features/territories/do_not_calls';
import useParentPage from '@features/territories/useParentPage';
import { tx } from '@services/i18n/translation';

const DoNotCallsPage = () => {
  const { parent, goBack } = useParentPage();
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
        title={tx('Do not call')}
        secondaryTitle={parent && tx(parent)}
        onBack={goBack}
      />

      <TerritoryDoNotCalls />
    </Box>
  );
};

export default DoNotCallsPage;
