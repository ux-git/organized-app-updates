import { useState } from 'react';
import { Box, MenuItem, Stack } from '@mui/material';
import { useNavigate } from 'react-router';
import { useAtomValue } from 'jotai';
import {
  Button,
  CustomDivider,
  FilterChip,
  InfoNote,
  Select,
  Typography,
} from '@components/index';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import { appLocaleState } from '@states/app';
import { territoryLocalModeState } from '@states/territories';
import { Territory, TerritoryType, TYPE_LABEL } from '@definition/territory';
import { tx } from '@services/i18n/translation';
import { displaySnackNotification } from '@services/states/app';
import { ChartCard } from '../components/charts';
import TruncatedText from '../components/truncated_text';
import UndoSnackbar from '../components/undo_snackbar';
import { territoryCampaignsState } from '../campaigns';
import {
  campaignChoices,
  campaignLabel,
  campaignRange,
  dateOf,
  dayOf,
} from '../campaign_dates';
import { assignmentIssues, toStoredDate } from '../helpers';
import {
  campaignEnded,
  campaignProgress,
  currentCampaign,
  outForCampaign,
} from '../campaign_filter';
import useAssignReturn from '../useAssignReturn';

const CampaignCard = ({ territories }: { territories: Territory[] }) => {
  const navigate = useNavigate();

  const campaigns = useAtomValue(territoryCampaignsState);
  const locale = useAtomValue(appLocaleState);
  const localMode = useAtomValue(territoryLocalModeState);

  const actions = useAssignReturn();

  const [picked, setPicked] = useState<string>();
  const [types, setTypes] = useState<TerritoryType[]>([]);
  // set while "Return all" waits for its date
  const [returnOn, setReturnOn] = useState<Date | null>();

  const choices = campaignChoices(campaigns, new Date());
  const campaign =
    choices.find((item) => item.id === picked) ??
    currentCampaign(campaigns) ??
    choices[0];

  if (!campaign) {
    return (
      <ChartCard title={tx('Special campaign')} span={4}>
        <InfoNote
          message={
            localMode
              ? tx(
                  'Special campaigns are entered under Settings → Special campaigns.'
                )
              : tx(
                  'Special campaigns come from the Upcoming events page: add a “Special campaign” event there.'
                )
          }
        />
      </ChartCard>
    );
  }

  const shown = types.length
    ? territories.filter((territory) => types.includes(territory.type))
    : territories;

  const progress = campaignProgress(shown, campaign.id);

  const rows = [
    { label: 'Worked', value: progress.worked, color: 'var(--green-main)' },
    { label: 'Out', value: progress.out, color: 'var(--orange-main)' },
    {
      label: 'Not yet assigned',
      value: progress.waiting,
      color: 'var(--accent-300)',
    },
  ];

  const stillOut = shown.flatMap((territory) => {
    const open = outForCampaign(territory, campaign.id);

    return open && campaignEnded(open, campaigns) ? [{ territory, open }] : [];
  });

  const returnIssues = returnOn
    ? stillOut.flatMap(({ open }) =>
        assignmentIssues({
          assignedOn: open.assignedOn,
          returnedOn: toStoredDate(returnOn),
        })
      )
    : [];
  const returnTooEarly = returnIssues.includes('returned_before_assigned');
  const returnFuture = returnIssues.includes('returned_future');

  const toggleType = (type: TerritoryType) =>
    setTypes(
      types.includes(type)
        ? types.filter((item) => item !== type)
        : [...types, type]
    );

  const shareSummary = async () => {
    const text = `${campaign.name} (${campaignRange(campaign, locale.code)}): ${tx(
      '{{worked}} of {{total}} territories worked, {{out}} out, {{waiting}} not yet assigned',
      progress
    )}`;

    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);

        displaySnackNotification({
          header: tx('Summary copied'),
          message: text,
          severity: 'success',
        });
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        displaySnackNotification({
          header: tx('Sharing failed'),
          message: (error as Error).message,
          severity: 'error',
        });
      }
    }
  };

  return (
    <ChartCard
      title={tx('Campaign progress')}
      hint={campaignLabel(campaign, locale.code)}
      note={tx('As of today')}
      span={4}
      action={
        <Button
          variant="small"
          disableAutoStretch
          minHeight={32}
          onClick={shareSummary}
        >
          {tx('Share summary')}
        </Button>
      }
    >
      {choices.length > 1 && (
        <Select
          label={tx('Special campaign')}
          value={campaign.id}
          onChange={(event) => setPicked(String(event.target.value))}
        >
          {choices.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              <Typography className="body-regular">
                {campaignLabel(item, locale.code)}
              </Typography>
            </MenuItem>
          ))}
        </Select>
      )}

      <Typography className="h2" color="var(--black)">
        {tx('{{covered}} of {{total}} covered', {
          covered: progress.worked,
          total: progress.total,
        })}
      </Typography>

      <Stack direction="row" spacing="4px" sx={{ height: '20px' }}>
        {rows.map((row) => (
          <Box
            key={row.label}
            title={`${tx(row.label)}: ${row.value}`}
            sx={{
              flexGrow: row.value || 0.02,
              borderRadius: 'var(--radius-s)',
              backgroundColor: row.color,
            }}
          />
        ))}
      </Stack>

      <Stack spacing="8px">
        {rows.map((row) => (
          <Stack
            key={row.label}
            direction="row"
            spacing="8px"
            sx={{ alignItems: 'center' }}
          >
            <Box
              sx={{
                width: '10px',
                height: '10px',
                borderRadius: 'var(--radius-max)',
                backgroundColor: row.color,
              }}
            />
            <Typography className="body-small-regular" color="var(--black)">
              {tx(row.label)}
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Typography className="body-small-semibold" color="var(--black)">
              {row.value}
            </Typography>
          </Stack>
        ))}
      </Stack>

      {/* narrows the view only; the campaign itself stays the same */}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: '8px' }}>
        {(Object.keys(TYPE_LABEL) as TerritoryType[]).map((type) => (
          <FilterChip
            key={type}
            label={tx(TYPE_LABEL[type])}
            selected={types.includes(type)}
            onClick={() => toggleType(type)}
          />
        ))}
      </Stack>

      {stillOut.length > 0 && (
        <Stack spacing="8px">
          <Stack
            direction="row"
            sx={{
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <Typography className="body-small-semibold" color="var(--black)">
              {tx('Still out after the end')}
            </Typography>
            <Button
              variant="small"
              disableAutoStretch
              onClick={() =>
                setReturnOn(
                  campaign.end < dayOf(new Date())
                    ? dateOf(campaign.end)
                    : new Date()
                )
              }
            >
              {tx('Return all')}
            </Button>
          </Stack>

          <Stack
            spacing="2px"
            divider={<CustomDivider color="var(--accent-200)" />}
          >
            {stillOut.map(({ territory, open }) => (
              <Stack
                key={territory.id}
                direction="row"
                spacing="12px"
                onClick={() =>
                  navigate(`/territories/${territory.id}`, {
                    state: { parent: 'Territory coverage statistics' },
                  })
                }
                sx={{
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: 'var(--radius-m)',
                  '&:hover': { backgroundColor: 'var(--accent-100)' },
                }}
              >
                <Typography
                  className="body-small-semibold"
                  color="var(--black)"
                  sx={{ width: '40px', flexShrink: 0 }}
                >
                  {territory.number}
                </Typography>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <TruncatedText
                    className="body-small-regular"
                    text={territory.name}
                  />
                  <TruncatedText
                    className="label-small-regular"
                    color="var(--grey-350)"
                    text={open.publisher}
                  />
                </Box>
              </Stack>
            ))}
          </Stack>
        </Stack>
      )}

      {returnOn !== undefined && (
        <Dialog
          onClose={() => setReturnOn(undefined)}
          open
          title={tx('Return all')}
          description={tx(
            'The territories still out for this campaign are returned on this date.'
          )}
        >
          <DatePicker
            label={tx('Returned on')}
            value={returnOn}
            error={returnTooEarly || returnFuture}
            helperText={
              returnTooEarly
                ? tx('Cannot be before the assigned date')
                : returnFuture
                  ? tx('This date is in the future')
                  : ''
            }
            onChange={(value) => setReturnOn(value)}
          />

          <DialogActions>
            <Button variant="secondary" onClick={() => setReturnOn(undefined)}>
              {tx('Cancel')}
            </Button>
            <Button
              variant="main"
              disabled={!returnOn || returnTooEarly || returnFuture}
              onClick={() => {
                if (!returnOn) return;
                actions.returnMany(
                  stillOut.map(({ territory }) => territory.id),
                  returnOn
                );
                setReturnOn(undefined);
              }}
            >
              {tx('Return')}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <UndoSnackbar
        notice={actions.undo}
        onUndo={actions.undoLast}
        onClose={actions.closeUndo}
      />
    </ChartCard>
  );
};

export default CampaignCard;
