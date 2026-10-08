import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box, Stack } from '@mui/material';
import { Badge, Button, InfoNote, Typography } from '@components/index';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import { useBreakpoints } from '@hooks/index';
import { IconCancelCicle } from '@icons/index';
import { shortDateFormatState } from '@states/settings';
import { territoryAssigneesState } from '../assignees';
import { territoryCampaignsState } from '../campaigns';
import {
  campaignChoices,
  campaignSnapshot,
  campaignsOn,
} from '../campaign_dates';
import {
  chosenHolder,
  holderMissing,
  initialHolder,
  rememberCard,
  rememberHolder,
  savedCard,
} from '../card_choice';
import { holderText } from '../group_holder';
import {
  assignmentIssues,
  displayDate,
  doNotCallLabel,
  toStoredDate,
} from '../helpers';
import { latestReturnNote } from '../notes';
import { startsBeforeOpen } from '../assignment_issues';
import CampaignField, { CampaignChoice } from './campaign_field';
import CardField from './card_field';
import { HolderModeSwitch, HolderPickers } from './holder_picker';
import {
  AssignmentCard,
  AssignmentHolder,
  Territory,
  TerritoryAssignment,
} from '@definition/territory';
import { tx } from '@services/i18n/translation';

type AssignDialogProps = {
  title: string;
  subtitle?: string;
  requestedBy?: string;
  // a reminder for whoever hands the card over
  doNotCalls?: number;
  // the one territory going out, for its notes; a bulk assign has none
  territory?: Territory;
  onClose: VoidFunction;
  onAssign: (
    holder: AssignmentHolder,
    assignedOn: Date,
    campaign: TerritoryAssignment['campaign'] | null,
    card?: AssignmentCard
  ) => void;
};

const AssignDialog = ({
  title,
  subtitle,
  requestedBy,
  doNotCalls = 0,
  territory,
  onClose,
  onAssign,
}: AssignDialogProps) => {
  const { tablet600Up } = useBreakpoints();

  const format = useAtomValue(shortDateFormatState);

  const assignees = useAtomValue(territoryAssigneesState);

  // still out: assigning returns it first, on the new start date
  const open = territory?.assignments.find((item) => !item.returnedOn);

  // whoever asked is the publisher; a transfer starts from the current holder
  const [holder, setHolder] = useState(() =>
    initialHolder(
      open,
      assignees.filter((item) => item.group).map(({ name }) => name),
      requestedBy
    )
  );
  const [tried, setTried] = useState(false);
  const [assignedOn, setAssignedOn] = useState<Date | null>(new Date());
  const [card, setCard] = useState<AssignmentCard | undefined>(savedCard);

  const lastNote = territory && latestReturnNote(territory.assignments);

  const campaigns = useAtomValue(territoryCampaignsState);
  const running = assignedOn ? campaignsOn(campaigns, assignedOn) : [];
  const choices = campaignChoices(campaigns, new Date());

  // the assigned-on date decides until the checkbox is touched
  const [manual, setManual] = useState<CampaignChoice>();
  const campaign = manual ?? { checked: running.length > 0, value: running[0] };

  const future =
    !!assignedOn &&
    assignmentIssues({ assignedOn: toStoredDate(assignedOn) }).length > 0;

  const beforeOpen =
    !!territory &&
    !!assignedOn &&
    startsBeforeOpen(territory.assignments, toStoredDate(assignedOn));

  return (
    <Dialog
      onClose={onClose}
      open
      header={
        // the badge sits top right, centred on the title, as on the
        // territory's overview
        <Stack
          direction="row"
          spacing="12px"
          sx={{ width: '100%', alignItems: 'flex-start' }}
        >
          <Stack spacing="2px" sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h2" className="h2">
              {title}
            </Typography>
            {subtitle && (
              <Typography color="var(--grey-400)">{subtitle}</Typography>
            )}
          </Stack>
          {doNotCalls > 0 && (
            <Box
              role="img"
              aria-label={doNotCallLabel(doNotCalls)}
              title={doNotCallLabel(doNotCalls)}
              sx={{
                flexShrink: 0,
                display: 'flex',
                minHeight: '24px',
                alignItems: 'center',
              }}
            >
              <Badge
                size="small"
                color="red"
                filled={false}
                text={String(doNotCalls)}
                icon={<IconCancelCicle color="var(--red-dark)" />}
                sx={{ width: 'fit-content' }}
              />
            </Box>
          )}
        </Stack>
      }
    >
      <HolderModeSwitch value={holder} onChange={setHolder} />

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
            name: holderText(lastNote),
            date: displayDate(lastNote.returnedOn, format),
            note: lastNote.note,
          })}
        </Typography>
      )}

      {open && assignedOn && (
        <InfoNote
          message={tx(
            '{{name}} still has it. It is returned on {{date}} first.',
            {
              name: holderText(open),
              date: displayDate(toStoredDate(assignedOn), format),
            }
          )}
        />
      )}

      <HolderPickers
        value={holder}
        onChange={setHolder}
        showMissing={tried}
        autoFocus={!tablet600Up}
      />

      <DatePicker
        label={tx('Assigned on')}
        value={assignedOn}
        error={future || beforeOpen}
        helperText={
          beforeOpen && open
            ? tx('Cannot be before {{name}} got it on {{date}}', {
                name: holderText(open),
                date: displayDate(open.assignedOn, format),
              })
            : future
              ? tx('This date is in the future')
              : ''
        }
        onChange={(value) => setAssignedOn(value)}
      />

      <CardField value={card} onChange={setCard} />

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
          disabled={!assignedOn || beforeOpen}
          onClick={() => {
            if (!assignedOn || beforeOpen) return;
            if (holderMissing(holder)) {
              setTried(true);
              return;
            }
            const chosen = chosenHolder(holder);
            rememberCard(card);
            rememberHolder(chosen.group);
            onAssign(
              chosen,
              assignedOn,
              campaign.checked && campaign.value
                ? campaignSnapshot(campaign.value)
                : null,
              card
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
