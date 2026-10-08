import { useAtom } from 'jotai';
import { Stack } from '@mui/material';
import Card from '@components/card';
import Typography from '@components/typography';
import { useAppTranslation } from '@hooks/index';
import { territoryOverdueMonthsState } from '@states/territories';
import RecommendationSettings from '@features/territories/hub/recommendation_settings';
import {
  TerritoryDisplaySettings,
  TerritoryOverdueSettings,
} from '@features/territories/hub/preference_controls';

const Preferences = () => {
  const { t } = useAppTranslation();
  const [overdue, setOverdue] = useAtom(territoryOverdueMonthsState);
  return (
    <Stack spacing="16px">
      <Typography color="var(--grey-400)">
        {t('tr_territoryPreferencesDescription')}
      </Typography>
      <Card>
        <Typography className="h2">{t('tr_territoryDisplay')}</Typography>
        <TerritoryDisplaySettings />
      </Card>
      <Card>
        <Typography className="h2">{t('tr_territoryAssignments')}</Typography>
        <TerritoryOverdueSettings value={overdue} onChange={setOverdue} />
      </Card>
      <Card>
        <RecommendationSettings />
      </Card>
    </Stack>
  );
};
export default Preferences;
