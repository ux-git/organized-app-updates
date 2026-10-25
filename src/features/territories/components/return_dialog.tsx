import { useNavigate } from 'react-router';
import TerritoryNoteField from '@features/territories/components/note_field';
import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box, Stack } from '@mui/material';
import { Button, TextField, Typography } from '@components/index';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import SwitchWithLabel from '@components/switch_with_label';
import { useAppTranslation, useBreakpoints } from '@hooks/index';
import { IconArrowLink, IconPrint } from '@icons/index';
import {
  territoryLocalModeState,
  territoriesShowHouseholdsState,
} from '@states/territories';
import { territoryCampaignsState } from '@features/territories/campaigns';
import {
  campaignOverlaps,
  campaignSnapshot,
} from '@features/territories/campaign_dates';
import {
  assignmentIssues,
  parseDate,
  toStoredDate,
} from '@features/territories/helpers';
import { parseHouseholds } from '@features/territories/assignment_issues';
import CampaignField, {
  CampaignChoice,
} from '@features/territories/components/campaign_field';
import { PublisherPicker } from '@features/territories/components/holder_picker';
import { holderOf } from '@features/territories/group_holder';
import {
  AssignmentHolder,
  Territory,
  TerritoryAssignment,
} from '@definition/territory';

type ReturnDialogProps = {
  territory?: Territory;
  // a publisher giving back their own: no campaign decisions
  own?: boolean;
  onClose: VoidFunction;
  onReturn: (
    id: string,
    households: number,
    returnedOn: Date,
    campaign?: TerritoryAssignment['campaign'] | null,
    note?: string,
    publisher?: string,
    completed?: boolean
  ) => void;
  onAssignAgain?: (
    id: string,
    holder: AssignmentHolder,
    assignedOn: Date
  ) => void;
};

const ReturnDialog = ({
  territory,
  own = false,
  onClose,
  onReturn,
  onAssignAgain,
}: ReturnDialogProps) => {
  const { t } = useAppTranslation();

  const { tablet600Up } = useBreakpoints();

  const navigate = useNavigate();
  const localMode = useAtomValue(territoryLocalModeState);
  const campaigns = useAtomValue(territoryCampaignsState);
  const showHouseholds = useAtomValue(territoriesShowHouseholdsState);

  const open = territory?.assignments.find((item) => !item.returnedOn);
  const flagged = open?.campaign;

  const [households, setHouseholds] = useState(
    territory ? String(territory.households) : ''
  );
  const [returnedOn, setReturnedOn] = useState<Date | null>(new Date());
  const [completed, setCompleted] = useState(true);
  const [note, setNote] = useState(open?.note ?? '');
  const [returnedBy, setReturnedBy] = useState(open?.publisher ?? '');
  const [assignAgain, setAssignAgain] = useState(false);
  const [campaign, setCampaign] = useState<CampaignChoice>({
    checked: !!flagged,
    value: flagged,
  });

  if (!territory) return null;

  const changedBy =
    returnedBy && returnedBy !== open?.publisher ? returnedBy : undefined;

  // the same publisher, for the same group; an old group record without one
  // goes out again through the assign dialog
  const publisher = changedBy ?? open?.publisher;
  const holder =
    open && publisher ? holderOf({ ...open, publisher }) : undefined;

  const issues = returnedOn
    ? assignmentIssues({
        assignedOn: open?.assignedOn ?? '',
        returnedOn: toStoredDate(returnedOn),
      })
    : [];
  const tooEarly = issues.includes('returned_before_assigned');
  const future = issues.includes('returned_future');

  const count = showHouseholds
    ? parseHouseholds(households, territory.households)
    : territory.households;

  const selectedCampaign = own
    ? flagged
    : campaign.checked
      ? campaign.value
      : undefined;
  const linkedCampaign = campaigns.find(
    (item) => item.id === selectedCampaign?.id
  );
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
      title={t('tr_territoryReturnNumber', { number: territory.number })}
      description={
        own
          ? t('tr_territoryEnterTheReturnDateAndHouseholdCount')
          : t('tr_territoryConfirmTheReturnDateAndHouseholdCount')
      }
    >
      {open && !own && (
        <PublisherPicker
          label={t('tr_territoryReturnedBy')}
          value={returnedBy}
          onChange={setReturnedBy}
          current={open.publisher}
        />
      )}

      <Stack
        direction={tablet600Up ? 'row' : 'column'}
        spacing="16px"
        sx={{ width: '100%' }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <DatePicker
            label={t('tr_territoryReturnedOn')}
            value={returnedOn}
            error={tooEarly || future}
            helperText={
              tooEarly
                ? t('tr_territoryCannotBeBeforeTheAssignedDate')
                : future
                  ? t('tr_territoryThisDateIsInTheFuture')
                  : ''
            }
            onChange={(value) => setReturnedOn(value)}
          />
        </Box>

        {showHouseholds && (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <TextField
              label={t('tr_territoryHouseholds')}
              type="number"
              value={households}
              error={count === null}
              helperText={
                count === null ? t('tr_territoryEnterAWholeNumber0OrMore') : ''
              }
              slotProps={{ htmlInput: { min: 0, step: 1 } }}
              onChange={(event) => setHouseholds(event.target.value)}
            />
          </Box>
        )}
      </Stack>

      <Stack spacing={1}>
        <SwitchWithLabel
          label={t(
            selectedCampaign
              ? 'tr_territoryCompleted'
              : 'tr_territoryRegularCovered'
          )}
          checked={completed}
          onChange={setCompleted}
          inputProps={{
            'aria-label': t(
              selectedCampaign
                ? 'tr_territoryCompleted'
                : 'tr_territoryRegularCovered'
            ),
          }}
        />
        {selectedCampaign &&
          (linkedCampaign ? (
            <Button
              variant="small"
              disableAutoStretch
              endIcon={<IconArrowLink />}
              href={`#${localMode ? '/settings/campaigns' : '/territories/campaigns'}?event=${encodeURIComponent(selectedCampaign.id)}`}
              target={localMode ? undefined : '_blank'}
              rel="noopener noreferrer"
              onClick={
                localMode
                  ? (event) => {
                      event.preventDefault();
                      navigate(
                        `/settings/campaigns?event=${encodeURIComponent(selectedCampaign.id)}`
                      );
                    }
                  : undefined
              }
              sx={{
                alignSelf: 'flex-start',
                textAlign: 'left',
                overflowWrap: 'anywhere',
              }}
            >
              {linkedCampaign.name}
            </Button>
          ) : (
            <Typography className="body-small-regular">
              {selectedCampaign.name}
            </Typography>
          ))}
      </Stack>
      <TerritoryNoteField kind="assignment" value={note} onChange={setNote} />

      {/* a card went out with it: a nudge to take it back */}
      {open?.card === 'printed' && (
        <Stack direction="row" spacing="8px" sx={{ alignItems: 'center' }}>
          <IconPrint color="var(--grey-400)" width={20} height={20} />
          <Typography className="body-small-regular" color="var(--grey-400)">
            {t('tr_territoryPrintedMap')}
          </Typography>
        </Stack>
      )}

      {!own && (flagged || overlapping.length > 0) && (
        <CampaignField
          label={
            flagged
              ? t('tr_territoryForTheCampaign')
              : t('tr_territoryAlsoWorkedForTheCampaign')
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
          label={t('tr_territoryAssignAgain')}
          helper={t('tr_territoryToTheSamePersonFromTheReturnDate')}
          checked={assignAgain}
          onChange={setAssignAgain}
        />
      )}

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t('tr_cancel')}
        </Button>
        <Button
          variant="main"
          disabled={!returnedOn || tooEarly || future || count === null}
          onClick={() => {
            if (!returnedOn || tooEarly || future || count === null) return;

            onReturn(
              territory.id,
              count,
              returnedOn,
              chosen(),
              note.trim(),
              own ? undefined : changedBy,
              completed
            );

            if (assignAgain && holder)
              onAssignAgain?.(territory.id, holder, returnedOn);

            onClose();
          }}
        >
          {assignAgain ? t('tr_territoryReturnAndAssign') : t('tr_return')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReturnDialog;
