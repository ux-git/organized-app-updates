import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box, Stack } from '@mui/material';
import { Button, TextField, Typography } from '@components/index';
import Autocomplete from '@components/autocomplete';
import InfoBanner from '@components/info_banner';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import MenuSubHeader from '@components/menu_sub_header';
import { useBreakpoints } from '@hooks/index';
import { IconAdd, IconCancelCicle } from '@icons/index';
import { shortDateFormatState } from '@states/settings';
import { territoryAssigneesState } from '../assignees';
import { territoryCampaignsState } from '../campaigns';
import {
  campaignChoices,
  campaignSnapshot,
  campaignsOn,
} from '../campaign_dates';
import { assignmentIssues, displayDate, toStoredDate } from '../helpers';
import { latestReturnNote } from '../notes';
import CampaignField, { CampaignChoice } from './campaign_field';
import {
  MAX_NOTE_LENGTH,
  Territory,
  TerritoryAssignment,
} from '@definition/territory';
import { tx } from '@services/i18n/translation';

type AssignDialogProps = {
  title: string;
  subtitle?: string;
  requestedBy?: string;
  // a reminder for whoever hands the card over
  doNotCallNote?: string;
  // the one territory going out: its notes, and a note for this assignment;
  // a bulk assign has neither
  territory?: Territory;
  onClose: VoidFunction;
  onAssign: (
    publisher: string,
    assignedOn: Date,
    campaign: TerritoryAssignment['campaign'] | null,
    note?: string
  ) => void;
};

const AssignDialog = ({
  title,
  subtitle,
  requestedBy,
  doNotCallNote,
  territory,
  onClose,
  onAssign,
}: AssignDialogProps) => {
  const { tablet600Up } = useBreakpoints();

  const format = useAtomValue(shortDateFormatState);

  // whoever asked is the choice; anyone else is only offered, never filled in
  const [publisher, setPublisher] = useState<string | null>(
    requestedBy ?? null
  );
  const [assignedOn, setAssignedOn] = useState<Date | null>(new Date());
  const [note, setNote] = useState<string>();

  const lastNote = territory && latestReturnNote(territory.assignments);

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

      {territory?.notes && (
        <Stack spacing="2px">
          <Typography className="body-small-semibold" color="var(--grey-400)">
            {tx('Notes')}
          </Typography>
          <Typography
            className="body-small-regular"
            color="var(--black)"
            sx={{ whiteSpace: 'pre-line' }}
          >
            {territory.notes}
          </Typography>
        </Stack>
      )}

      {lastNote && (
        <Typography
          className="body-small-regular"
          color="var(--grey-400)"
          sx={{ whiteSpace: 'pre-line' }}
        >
          {tx('Last return ({{name}}, {{date}}): {{note}}', {
            name: lastNote.publisher,
            date: displayDate(lastNote.returnedOn, format),
            note: lastNote.note,
          })}
        </Typography>
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

      {/* folded away until wanted: most assignments carry no note */}
      {territory &&
        (note === undefined ? (
          <Button
            variant="small"
            disableAutoStretch
            startIcon={<IconAdd color="var(--accent-main)" />}
            onClick={() => setNote('')}
            sx={{ alignSelf: 'flex-start', minHeight: '32px' }}
          >
            {tx('Add note')}
          </Button>
        ) : (
          <TextField
            label={tx('Note')}
            multiline
            minRows={2}
            autoFocus
            value={note}
            slotProps={{ htmlInput: { maxLength: MAX_NOTE_LENGTH } }}
            onChange={(event) => setNote(event.target.value)}
          />
        ))}

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
                : null,
              note?.trim() || undefined
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
