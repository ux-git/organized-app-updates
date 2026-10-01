import { tx } from '@services/i18n/translation';
import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box, Stack } from '@mui/material';
import { Button, InfoNote, TextField } from '@components/index';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import SwitchWithLabel from '@components/switch_with_label';
import { useBreakpoints } from '@hooks/index';
import { IconCopy } from '@icons/index';
import { territoryAssigneesState } from '../assignees';
import { territoryCampaignsState } from '../campaigns';
import {
  campaignChoices,
  campaignFor,
  campaignOverlaps,
  campaignSnapshot,
} from '../campaign_dates';
import CampaignField, { CampaignChoice } from '../components/campaign_field';
import CardField from '../components/card_field';
import EditorHeader from '../components/editor_header';
import PublisherSearch from '../components/publisher_search';
import { savedCard } from '../card_choice';
import {
  assignmentFromDates,
  assignmentIssues,
  parseDate,
  toStoredDate,
} from '../helpers';
import {
  AssignmentCard,
  MAX_NOTE_LENGTH,
  TerritoryAssignment,
} from '@definition/territory';

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const AssignmentEditor = ({
  assignment,
  isNew = false,
  otherOpen = false,
  onClose,
  onSave,
  onDelete,
  onAdoptNote,
}: {
  assignment: TerritoryAssignment;
  isNew?: boolean;
  otherOpen?: boolean;
  onClose: VoidFunction;
  onSave: (next: TerritoryAssignment) => void;
  onDelete?: VoidFunction;
  // the note is worth keeping on the territory itself
  onAdoptNote?: VoidFunction;
}) => {
  const { tablet600Up } = useBreakpoints();

  const assignees = useAtomValue(territoryAssigneesState);
  const campaigns = useAtomValue(territoryCampaignsState);

  const [publisher, setPublisher] = useState(assignment.publisher);

  const groups = new Set(
    assignees.filter((assignee) => assignee.group).map(({ name }) => name)
  );
  // a name no longer on the list, e.g. someone who moved, stays choosable
  const names = assignees.map(({ name }) => name);
  const options =
    publisher && !names.includes(publisher) ? [...names, publisher] : names;
  const [assignedOn, setAssignedOn] = useState<Date | null>(
    parseDate(assignment.assignedOn) ?? new Date()
  );
  const [returnedOn, setReturnedOn] = useState<Date | null>(
    parseDate(assignment.returnedOn)
  );
  const [note, setNote] = useState(assignment.note ?? '');
  const [card, setCard] = useState<AssignmentCard | undefined>(
    assignment.card ?? (isNew ? savedCard() : undefined)
  );

  // a new one starts from the campaign running on its day, like an assignment
  const [campaign, setCampaign] = useState<CampaignChoice>(() => {
    const value =
      assignment.campaign ??
      (isNew
        ? campaignFor(campaigns, parseDate(assignment.assignedOn) ?? new Date())
        : undefined);

    return { checked: !!value, value };
  });
  const [coverage, setCoverage] = useState(!!assignment.campaign?.coverage);

  const overlapping = campaigns.filter((item) =>
    campaignOverlaps(item, assignedOn ?? new Date(), returnedOn ?? new Date())
  );
  const choices = campaignChoices(campaigns, new Date());

  const returnedTooEarly =
    !!assignedOn &&
    !!returnedOn &&
    startOfDay(returnedOn) < startOfDay(assignedOn);

  // allowed, but worth a second look
  const issues = assignmentIssues({
    assignedOn: assignedOn ? toStoredDate(assignedOn) : '',
    returnedOn: returnedOn ? toStoredDate(returnedOn) : undefined,
  });

  const secondOpen = otherOpen && !returnedOn;

  return (
    <Dialog
      onClose={onClose}
      open
      header={
        <EditorHeader
          title={isNew ? tx('Add assignment') : tx('Edit assignment')}
          description={tx(
            'Who worked the territory, and when it was taken and returned.'
          )}
          onDelete={
            onDelete && !isNew
              ? () => {
                  onDelete();
                  onClose();
                }
              : undefined
          }
        />
      }
    >
      <PublisherSearch
        options={options}
        value={publisher || null}
        onChange={(value) => setPublisher(value ?? '')}
        getName={(name) => name}
        isGroup={(name) => groups.has(name)}
        autoFocus={!tablet600Up && !publisher}
      />

      <Stack
        direction={tablet600Up ? 'row' : 'column'}
        spacing="16px"
        sx={{ width: '100%' }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <DatePicker
            label={tx('Assigned on')}
            value={assignedOn}
            error={issues.includes('assigned_future')}
            helperText={
              issues.includes('assigned_future')
                ? tx('This date is in the future')
                : ''
            }
            onChange={(value) => setAssignedOn(value)}
          />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <DatePicker
            label={tx('Returned on')}
            value={returnedOn}
            minDate={assignedOn}
            error={returnedTooEarly || issues.includes('returned_future')}
            helperText={
              returnedTooEarly
                ? tx('Cannot be before the assigned date')
                : issues.includes('returned_future')
                  ? tx('This date is in the future')
                  : ''
            }
            onChange={(value) => setReturnedOn(value)}
          />
        </Box>
      </Stack>

      <CardField value={card} onChange={setCard} />

      <TextField
        label={tx('Note')}
        multiline
        minRows={2}
        value={note}
        slotProps={{ htmlInput: { maxLength: MAX_NOTE_LENGTH } }}
        onChange={(event) => setNote(event.target.value)}
      />

      {onAdoptNote && (
        <Button
          variant="small"
          disableAutoStretch
          startIcon={<IconCopy color="var(--accent-main)" />}
          onClick={onAdoptNote}
          sx={{ minHeight: '32px', minWidth: 'unset', marginTop: '-8px' }}
        >
          {tx('Add to territory notes')}
        </Button>
      )}

      {(campaigns.length > 0 || campaign.value) && (
        <CampaignField
          label={tx('For the campaign')}
          running={overlapping}
          choices={choices}
          checked={campaign.checked}
          value={campaign.value}
          onChange={setCampaign}
        />
      )}

      {campaign.checked && campaign.value && (
        <SwitchWithLabel
          label={tx('Counts as regular coverage')}
          helper={tx('The territory counts as covered by this work too.')}
          checked={coverage}
          onChange={setCoverage}
        />
      )}

      {secondOpen && (
        <InfoNote
          message={tx(
            'The territory is already out with someone. Add a returned date, or return the open assignment first.'
          )}
        />
      )}

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button
          variant="main"
          disabled={!publisher || returnedTooEarly || secondOpen}
          onClick={() => {
            onSave({
              ...assignmentFromDates(
                assignment,
                publisher,
                assignedOn ?? new Date(),
                returnedOn
              ),
              campaign:
                campaign.checked && campaign.value
                  ? campaignSnapshot(campaign.value, coverage)
                  : undefined,
              note: note.trim() || undefined,
              card,
            });
            onClose();
          }}
        >
          {tx('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AssignmentEditor;
