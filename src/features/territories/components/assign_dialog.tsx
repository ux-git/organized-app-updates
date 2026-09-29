import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box, Stack } from '@mui/material';
import { Button, Typography } from '@components/index';
import Autocomplete from '@components/autocomplete';
import InfoBanner from '@components/info_banner';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import MenuSubHeader from '@components/menu_sub_header';
import { useBreakpoints } from '@hooks/index';
import { IconCancelCicle } from '@icons/index';
import { territoryAssigneesState } from '../assignees';
import { territoryCampaignsState } from '../campaigns';
import {
  campaignChoices,
  campaignSnapshot,
  campaignsOn,
} from '../campaign_dates';
import { assignmentIssues, suggestedPublisher, toStoredDate } from '../helpers';
import CampaignField, { CampaignChoice } from './campaign_field';
import { Territory, TerritoryAssignment } from '@definition/territory';
import { tx } from '@services/i18n/translation';

type AssignDialogProps = {
  title: string;
  subtitle?: string;
  requestedBy?: string;
  // a reminder for whoever hands the card over
  doNotCallNote?: string;
  territories: Territory[];
  onClose: VoidFunction;
  onAssign: (
    publisher: string,
    assignedOn: Date,
    campaign: TerritoryAssignment['campaign'] | null
  ) => void;
};

const AssignDialog = ({
  title,
  subtitle,
  requestedBy,
  doNotCallNote,
  territories,
  onClose,
  onAssign,
}: AssignDialogProps) => {
  const { tablet600Up } = useBreakpoints();

  // whoever asked is the choice; anyone else is only offered, never filled in
  const [publisher, setPublisher] = useState<string | null>(
    requestedBy ?? null
  );
  const [assignedOn, setAssignedOn] = useState<Date | null>(new Date());

  const assignees = useAtomValue(territoryAssigneesState);
  const groups = new Set(
    assignees.filter((assignee) => assignee.group).map(({ name }) => name)
  );

  const campaigns = useAtomValue(territoryCampaignsState);
  const running = assignedOn ? campaignsOn(campaigns, assignedOn) : [];
  const choices = campaignChoices(campaigns, new Date());

  // the assigned-on date decides until the checkbox is touched
  const [manual, setManual] = useState<CampaignChoice>();
  const campaign = manual ?? { checked: running.length > 0, value: running[0] };

  const suggestion = suggestedPublisher(territories, assignees);

  const future =
    !!assignedOn &&
    assignmentIssues({ assignedOn: toStoredDate(assignedOn) }).length > 0;

  return (
    <Dialog onClose={onClose} open title={title} description={subtitle}>
      {doNotCallNote && (
        <InfoBanner
          variant="red"
          icon={<IconCancelCicle color="var(--red-main)" />}
          className="body-small-semibold"
          sx={{ width: '100%' }}
        >
          {doNotCallNote}
        </InfoBanner>
      )}

      <Stack
        direction={tablet600Up ? 'row' : 'column'}
        spacing="16px"
        sx={{ width: '100%' }}
      >
        <Stack spacing="4px" sx={{ flex: 1, minWidth: 0 }}>
          <Autocomplete
            label={tx('Publisher')}
            options={assignees.map(({ name }) => name)}
            groupBy={(option: string) =>
              groups.has(option) ? tx('Groups') : tx('Publishers')
            }
            renderGroup={(params) => (
              <li key={params.key}>
                <MenuSubHeader>{params.group}</MenuSubHeader>
                <Box component="ul" sx={{ padding: 0 }}>
                  {params.children}
                </Box>
              </li>
            )}
            renderOption={({ key, ...props }, option: string) => (
              <Box component="li" key={key} {...props}>
                <Typography className="body-regular">{option}</Typography>
              </Box>
            )}
            value={publisher}
            onChange={(_, value) => setPublisher(value as string | null)}
          />

          {!publisher && suggestion && (
            <Button
              variant="small"
              disableAutoStretch
              onClick={() => setPublisher(suggestion)}
              sx={{ alignSelf: 'flex-start', minHeight: '32px' }}
            >
              {tx('Suggestion: {{name}}', { name: suggestion })}
            </Button>
          )}
        </Stack>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <DatePicker
            label={tx('Assigned on')}
            value={assignedOn}
            error={future}
            helperText={future ? tx('This date is in the future') : ''}
            onChange={(value) => setAssignedOn(value)}
          />
        </Box>
      </Stack>

      {campaigns.length > 0 && (
        <CampaignField
          label={tx('For the campaign')}
          running={running}
          choices={choices}
          checked={campaign.checked}
          value={campaign.value}
          onChange={setManual}
        />
      )}

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button
          variant="main"
          disabled={!publisher}
          onClick={() => {
            if (!publisher) return;
            onAssign(
              publisher,
              assignedOn ?? new Date(),
              campaign.checked && campaign.value
                ? campaignSnapshot(campaign.value)
                : null
            );
            onClose();
          }}
        >
          {tx('Assign')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AssignDialog;
