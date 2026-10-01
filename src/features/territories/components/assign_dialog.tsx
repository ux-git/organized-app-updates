import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box, Stack } from '@mui/material';
import { Badge, Button, Typography } from '@components/index';
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
import { rememberCard, savedCard } from '../card_choice';
import {
  assignmentIssues,
  displayDate,
  doNotCallLabel,
  toStoredDate,
} from '../helpers';
import { latestReturnNote } from '../notes';
import CampaignField, { CampaignChoice } from './campaign_field';
import CardField from './card_field';
import PublisherSearch from './publisher_search';
import {
  AssignmentCard,
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
    publisher: string,
    assignedOn: Date,
    campaign: TerritoryAssignment['campaign'] | null,
    card: AssignmentCard
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

  // whoever asked is the choice; anyone else is only offered, never filled in
  const [publisher, setPublisher] = useState<string | null>(
    requestedBy ?? null
  );
  const [assignedOn, setAssignedOn] = useState<Date | null>(new Date());
  const [card, setCard] = useState<AssignmentCard>(savedCard);

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
    <Dialog
      onClose={onClose}
      open
      header={
        <Stack direction="row" spacing="8px" sx={{ alignItems: 'flex-start' }}>
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
              sx={{ flexShrink: 0 }}
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
          <PublisherSearch
            options={assignees.map(({ name }) => name)}
            value={publisher}
            onChange={setPublisher}
            getName={(name) => name}
            isGroup={(name) => groups.has(name)}
            autoFocus={!tablet600Up && !publisher}
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
          disabled={!publisher}
          onClick={() => {
            if (!publisher) return;
            rememberCard(card);
            onAssign(
              publisher,
              assignedOn ?? new Date(),
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
