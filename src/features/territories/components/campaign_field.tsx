import { useAtomValue } from 'jotai';
import { Box, MenuItem, Stack } from '@mui/material';
import { Checkbox, Select, Typography } from '@components/index';
import { appLocaleState } from '@states/app';
import { TerritoryCampaign } from '@definition/territory';
import { campaignLabel } from '../campaign_dates';
import { tx } from '@services/i18n/translation';

export type CampaignRef = Pick<TerritoryCampaign, 'id' | 'name'>;

export type CampaignChoice = { checked: boolean; value?: CampaignRef };

// The "For the campaign" row: a checkbox, and with it the campaign as small
// grey text when the dates settle it, or a select when there is a choice.
const CampaignField = ({
  label,
  running,
  choices,
  checked,
  value,
  onChange,
}: {
  label: string;
  // the campaigns the dates fall into: one reads as text, several as a select
  running: TerritoryCampaign[];
  // what to pick from when the dates fall into none
  choices: TerritoryCampaign[];
  checked: boolean;
  value?: CampaignRef;
  onChange: (next: CampaignChoice) => void;
}) => {
  const locale = useAtomValue(appLocaleState).code;

  const options = running.length > 0 ? running : choices;
  const known = options.find((campaign) => campaign.id === value?.id);
  const select =
    running.length > 1 || (running.length === 0 && choices.length > 0);
  // a single running campaign reads as text whether it is ticked yet or not
  const shown = known ?? (running.length === 1 ? running[0] : undefined);
  const text = shown ? campaignLabel(shown, locale) : value?.name;

  if (!select && !text) return null;

  // a campaign that has since been deleted stays pickable by its name
  const items = [
    ...options.map((campaign) => ({
      ...campaign,
      label: campaignLabel(campaign, locale),
    })),
    ...(value && !known ? [{ ...value, label: value.name }] : []),
  ];

  return (
    <Stack spacing="8px" sx={{ width: '100%' }}>
      <Checkbox
        label={label}
        labelDescription={select ? undefined : text}
        checked={checked}
        onChange={(_, next) =>
          onChange({
            checked: next,
            value: value ?? (next ? options[0] : undefined),
          })
        }
      />

      {select && (
        <Box sx={{ paddingLeft: '28px' }}>
          <Select
            label={tx('Special campaign')}
            value={value?.id ?? ''}
            onChange={(event) =>
              onChange({
                checked: true,
                value: items.find((item) => item.id === event.target.value),
              })
            }
          >
            {items.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                <Typography className="body-regular">{item.label}</Typography>
              </MenuItem>
            ))}
          </Select>
        </Box>
      )}
    </Stack>
  );
};

export default CampaignField;
