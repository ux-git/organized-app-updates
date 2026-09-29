import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box, Stack } from '@mui/material';
import { Button, TextField, Typography } from '@components/index';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import SwitchWithLabel from '@components/switch_with_label';
import { useBreakpoints } from '@hooks/index';
import { IconCampaign, IconPrint } from '@icons/index';
import { appLocaleState } from '@states/app';
import { territoryCampaignsState } from '../campaigns';
import {
  campaignLabel,
  campaignOverlaps,
  campaignSnapshot,
} from '../campaign_dates';
import { assignmentIssues, parseDate, toStoredDate } from '../helpers';
import CampaignField, { CampaignChoice } from './campaign_field';
import {
  MAX_NOTE_LENGTH,
  Territory,
  TerritoryAssignment,
} from '@definition/territory';
import { tx } from '@services/i18n/translation';

type ReturnDialogProps = {
  territory?: Territory;
  // a publisher giving back their own: no campaign decisions, no reassigning
  own?: boolean;
  onClose: VoidFunction;
  onReturn: (
    id: string,
    households: number,
    returnedOn: Date,
    campaign?: TerritoryAssignment['campaign'] | null,
    note?: string
  ) => void;
  onAssignAgain?: (id: string, publisher: string, assignedOn: Date) => void;
};

const ReturnDialog = ({
  territory,
  own = false,
  onClose,
  onReturn,
  onAssignAgain,
}: ReturnDialogProps) => {
  const { tablet600Up } = useBreakpoints();

  const locale = useAtomValue(appLocaleState).code;
  const campaigns = useAtomValue(territoryCampaignsState);

  const open = territory?.assignments.find((item) => !item.returnedOn);
  const flagged = open?.campaign;

  const [households, setHouseholds] = useState(
    territory ? String(territory.households) : ''
  );
  const [returnedOn, setReturnedOn] = useState<Date | null>(new Date());
  const [note, setNote] = useState(open?.note ?? '');
  const [assignAgain, setAssignAgain] = useState(false);
  const [campaign, setCampaign] = useState<CampaignChoice>({
    checked: !!flagged,
    value: flagged,
  });

  if (!territory) return null;

  const holder = territory.holder;

  const issues = returnedOn
    ? assignmentIssues({
        assignedOn: open?.assignedOn ?? '',
        returnedOn: toStoredDate(returnedOn),
      })
    : [];
  const tooEarly = issues.includes('returned_before_assigned');
  const future = issues.includes('returned_future');

  const known = flagged && campaigns.find((item) => item.id === flagged.id);
  const assigned = parseDate(open?.assignedOn);
  // unflagged work that still ran into a campaign can be filed under it
  const overlapping =
    !flagged && assigned && returnedOn
      ? campaigns.filter((item) => campaignOverlaps(item, assigned, returnedOn))
      : [];

  const chosen = () => {
    if (own) return undefined;
    if (!campaign.checked || !campaign.value) return null;

    return campaign.value.id === flagged?.id
      ? flagged
      : campaignSnapshot(campaign.value);
  };

  return (
    <Dialog
      onClose={onClose}
      open
      title={tx('Return {{number}}', { number: territory.number })}
      description={
        own
          ? tx(
              'Enter when you handed the territory back and how many households you counted.'
            )
          : tx(
              'Confirm when the territory came back and the households count the publisher reported.'
            )
      }
    >
      <Stack
        direction={tablet600Up ? 'row' : 'column'}
        spacing="16px"
        sx={{ width: '100%' }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <DatePicker
            label={tx('Returned on')}
            value={returnedOn}
            error={tooEarly || future}
            helperText={
              tooEarly
                ? tx('Cannot be before the assigned date')
                : future
                  ? tx('This date is in the future')
                  : ''
            }
            onChange={(value) => setReturnedOn(value)}
          />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <TextField
            label={tx('Households')}
            type="number"
            value={households}
            onChange={(event) => setHouseholds(event.target.value)}
          />
        </Box>
      </Stack>

      {/* a card went out with it: a nudge to take it back */}
      {open?.card === 'printed' && (
        <Stack direction="row" spacing="8px" sx={{ alignItems: 'center' }}>
          <IconPrint color="var(--grey-400)" width={20} height={20} />
          <Typography className="body-small-regular" color="var(--grey-400)">
            {tx('Printed card')}
          </Typography>
        </Stack>
      )}

      <TextField
        label={tx('Note')}
        placeholder={tx(
          'e.g. 5 Russian-speaking, 3 Ukrainian-speaking households'
        )}
        multiline
        minRows={2}
        value={note}
        slotProps={{ htmlInput: { maxLength: MAX_NOTE_LENGTH } }}
        onChange={(event) => setNote(event.target.value)}
      />

      {own && flagged && (
        <Stack direction="row" spacing="8px" sx={{ alignItems: 'center' }}>
          <IconCampaign color="var(--grey-400)" width={20} height={20} />
          <Typography className="body-small-regular" color="var(--grey-400)">
            {tx('For the campaign')} ·{' '}
            {known ? campaignLabel(known, locale) : flagged.name}
          </Typography>
        </Stack>
      )}

      {!own && (flagged || overlapping.length > 0) && (
        <CampaignField
          label={
            flagged
              ? tx('For the campaign')
              : tx('Also worked for the campaign')
          }
          running={flagged ? (known ? [known] : []) : overlapping}
          choices={[]}
          checked={campaign.checked}
          value={campaign.value}
          onChange={setCampaign}
        />
      )}

      {holder && onAssignAgain && (
        <SwitchWithLabel
          label={tx('Assign again to {{name}}', { name: holder })}
          helper={tx('Starts a new assignment on the same date')}
          checked={assignAgain}
          onChange={setAssignAgain}
        />
      )}

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button
          variant="main"
          disabled={tooEarly}
          onClick={() => {
            const date = returnedOn ?? new Date();

            onReturn(
              territory.id,
              Number(households) || territory.households,
              date,
              chosen(),
              note.trim()
            );

            if (assignAgain && holder)
              onAssignAgain?.(territory.id, holder, date);

            onClose();
          }}
        >
          {assignAgain ? tx('Return and assign') : tx('Return')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReturnDialog;
