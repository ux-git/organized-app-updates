import { useState } from 'react';
import { Box, MenuItem, Stack } from '@mui/material';
import { useAtomValue } from 'jotai';
import { FilterChip, Select, Typography } from '@components/index';
import { appLocaleState } from '@states/app';
import { TerritoryFilters } from '@definition/territory';
import { tx } from '@services/i18n/translation';
import { territoryCampaignsState } from '../campaigns';
import { campaignChoices, campaignLabel } from '../campaign_dates';
import { currentCampaign } from '../campaign_filter';

// under the work status: not reached by a special campaign yet, or worked for it
const CampaignChips = ({
  filters,
  onChange,
}: {
  filters: TerritoryFilters;
  onChange: (next: TerritoryFilters) => void;
}) => {
  const campaigns = useAtomValue(territoryCampaignsState);
  const locale = useAtomValue(appLocaleState);

  const [picked, setPicked] = useState<string>();

  const choices = campaignChoices(campaigns, new Date());
  const campaign =
    choices.find((item) => item.id === (filters.campaign?.id ?? picked)) ??
    currentCampaign(campaigns) ??
    choices[0];

  if (!campaign) return null;

  const pick = (id: string) => {
    setPicked(id);

    if (filters.campaign) {
      onChange({ ...filters, campaign: { ...filters.campaign, id } });
    }
  };

  const isOn = (worked: boolean) =>
    filters.campaign?.id === campaign.id && filters.campaign.worked === worked;

  const toggle = (worked: boolean) =>
    onChange({
      ...filters,
      campaign: isOn(worked) ? undefined : { id: campaign.id, worked },
    });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {choices.length > 1 ? (
        <Select
          label={tx('Special campaign')}
          value={campaign.id}
          onChange={(event) => pick(String(event.target.value))}
        >
          {choices.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              <Typography className="body-regular">
                {campaignLabel(item, locale.code)}
              </Typography>
            </MenuItem>
          ))}
        </Select>
      ) : (
        <Typography className="body-small-regular" color="var(--grey-400)">
          {campaignLabel(campaign, locale.code)}
        </Typography>
      )}

      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: '8px' }}>
        <FilterChip
          label={tx('Not yet in {{campaign}}', { campaign: campaign.name })}
          selected={isOn(false)}
          onClick={() => toggle(false)}
        />
        <FilterChip
          label={tx('Worked in {{campaign}}', { campaign: campaign.name })}
          selected={isOn(true)}
          onClick={() => toggle(true)}
        />
      </Stack>
    </Box>
  );
};

export default CampaignChips;
