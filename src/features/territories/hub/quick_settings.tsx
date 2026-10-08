import { Stack } from '@mui/material';
import { useAtomValue } from 'jotai';
import QuickSettings from '@features/quick_settings';
import { territoryLocalModeState } from '@states/territories';
import { tx } from '@services/i18n/translation';
import RecommendationSettings from './recommendation_settings';
import {
  TerritoryDisplaySettings,
  TerritoryOverdueSettings,
} from './preference_controls';

type TerritoriesQuickSettingsProps = {
  open: boolean;
  onClose: VoidFunction;
  overdueMonths: number;
  onOverdueMonthsChange: (value: number) => void;
};

const TerritoriesQuickSettings = ({
  open,
  onClose,
  overdueMonths,
  onOverdueMonthsChange,
}: TerritoriesQuickSettingsProps) => {
  const local = useAtomValue(territoryLocalModeState);
  return (
    <QuickSettings title={tx('Territories')} open={open} onClose={onClose}>
      <Stack spacing="16px" sx={{ width: '100%' }}>
        <TerritoryDisplaySettings />
        <TerritoryOverdueSettings
          value={overdueMonths}
          onChange={onOverdueMonthsChange}
        />
        {local && <RecommendationSettings />}
      </Stack>
    </QuickSettings>
  );
};
export default TerritoriesQuickSettings;
