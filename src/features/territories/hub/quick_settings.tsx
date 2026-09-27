import { Box, MenuItem, Stack } from '@mui/material';
import { Select, Typography } from '@components/index';
import SwitchWithLabel from '@components/switch_with_label';
import QuickSettings from '@features/quick_settings';
import { tx } from '@services/i18n/translation';

type TerritoriesQuickSettingsProps = {
  open: boolean;
  onClose: VoidFunction;
  showHouseholds: boolean;
  onShowHouseholdsChange: (value: boolean) => void;
  overdueMonths: number;
  onOverdueMonthsChange: (value: number) => void;
};

const TerritoriesQuickSettings = ({
  open,
  onClose,
  showHouseholds,
  onShowHouseholdsChange,
  overdueMonths,
  onOverdueMonthsChange,
}: TerritoriesQuickSettingsProps) => (
  <QuickSettings title={tx('Territories')} open={open} onClose={onClose}>
    <Stack spacing="16px" sx={{ width: '100%' }}>
      <SwitchWithLabel
        label={tx('Show households count')}
        helper={tx('Display the number of households next to every territory')}
        checked={showHouseholds}
        onChange={onShowHouseholdsChange}
      />

      <Stack
        direction="row"
        spacing="16px"
        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Stack spacing="4px">
          <Typography className="body-regular" color="var(--black)">
            {tx('Overdue period')}
          </Typography>
          <Typography className="label-small-regular" color="var(--grey-350)">
            {tx(
              'Months a publisher may hold a territory before it counts as overdue'
            )}
          </Typography>
        </Stack>

        <Box sx={{ width: '116px', flexShrink: 0 }}>
          <Select
            label={tx('Months')}
            value={String(overdueMonths)}
            onChange={(event) =>
              onOverdueMonthsChange(Number(event.target.value))
            }
          >
            {[3, 4, 5, 6, 9, 12].map((months) => (
              <MenuItem key={months} value={String(months)}>
                <Typography className="body-regular">{months}</Typography>
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Stack>
    </Stack>
  </QuickSettings>
);

export default TerritoriesQuickSettings;
