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
import { territoryAssigneesState } from '@features/territories/assignees';
import { territoryCampaignsState } from '@features/territories/campaigns';
import {
  campaignOverlaps,
  campaignSnapshot,
} from '@features/territories/campaign_dates';
import { parseDate } from '@features/territories/helpers';
import {
  parseTerritoryHouseholds,
  territoryReturnDateError,
  territoryHolderAvailable,
} from '@utils/territory_assignments';
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
  ) => boolean;
  onAssignAgain?: (
    id: string,
    holder: AssignmentHolder,
    assignedOn: Date
  ) => boolean;
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
  const assignees = useAtomValue(territoryAssigneesState);
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

  const canAssignAgain =
    !!onAssignAgain && !!holder && territoryHolderAvailable(holder, assignees);
  const reassign = assignAgain && canAssignAgain;

  const dateError = territoryReturnDateError(territory.assignments, returnedOn);

  const count = showHouseholds
    ? parseTerritoryHouseholds(households, territory.households)
    : territory.households;

  const chosenCampaign = campaign.checked ? campaign.value : undefined;
  const selectedCampaign = own ? flagged : chosenCampaign;
  const linkedCampaign = campaigns.find(
    (item) => item.id === selectedCampaign?.id
  );
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
            error={!!dateError}
            helperText={dateError ? t(dateError) : ''}
            onChange={(value) => setReturnedOn(value)}
          />
        </Box>

        {showHouseholds && (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <TextField
              label={t('tr_territoryHouseholds')}
              type="number"
              value={households}
              error={count === undefined}
              helperText={
                count === undefined
                  ? t('tr_territoryEnterAWholeNumber0OrMore')
                  : ''
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
          checked={campaign.checked}
          value={campaign.value}
          onChange={setCampaign}
        />
      )}

      {canAssignAgain && (
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
          disabled={!returnedOn || !!dateError || count === undefined}
          onClick={() => {
            if (!returnedOn || !!dateError || count === undefined) return;

            const returned = onReturn(
              territory.id,
              count,
              returnedOn,
              chosen(),
              note.trim(),
              own ? undefined : changedBy,
              completed
            );

            if (!returned) return;

            if (reassign && holder)
              onAssignAgain?.(territory.id, holder, returnedOn);

            onClose();
          }}
        >
          {reassign ? t('tr_territoryReturnAndAssign') : t('tr_return')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReturnDialog;
