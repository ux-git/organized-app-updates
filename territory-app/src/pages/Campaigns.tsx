import { useSearchParams } from 'react-router';
import { useState } from 'react';
import { isValid } from 'date-fns';
import { useAtom } from 'jotai';
import { Box, Stack } from '@mui/material';
import { IconAdd } from '@icons/index';
import Button from '@components/button';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import NavBarButton from '@components/nav_bar_button';
import NavBarButtonGroup from '@components/nav_bar_button_group';
import PageTitle from '@components/page_title';
import TextField from '@components/textfield';
import Typography from '@components/typography';
import CampaignOverview from '@features/territories/components/campaign_overview';
import EditorHeader from '@features/territories/components/editor_header';
import { useAppTranslation, useBreakpoints } from '@hooks/index';
import { NavBarOptionsType } from '@definition/app';
import { TerritoryCampaign } from '@definition/territory';
import { dateOf, dayOf } from '@features/territories/campaign_dates';
import { upsertById } from '@features/territories/helpers';
import { offerUndo } from '@features/territories/undo';
import { territoryCampaignsState } from '../campaigns';
import { play } from '../haptics';
import { t } from '../i18n';

const CampaignDialog = ({
  campaign,
  onClose,
  onSave,
  onRemove,
}: {
  campaign: TerritoryCampaign | 'new' | null;
  onClose: VoidFunction;
  onSave: (campaign: TerritoryCampaign) => void;
  onRemove?: VoidFunction;
}) => {
  const { tablet600Up } = useBreakpoints();
  const { t: translate } = useAppTranslation();
  const existing = campaign && campaign !== 'new' ? campaign : null;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [shown, setShown] = useState<typeof campaign>(null);

  if (campaign !== shown) {
    setShown(campaign);
    setName(existing?.name ?? '');
    setDescription(existing?.description ?? '');
    setStart(existing ? dateOf(existing.start) : new Date());
    setEnd(existing ? dateOf(existing.end) : new Date());
  }

  const datesValid = !!start && !!end && isValid(start) && isValid(end);
  const backwards = datesValid && dayOf(end) < dayOf(start);
  const valid = !!name.trim() && datesValid && !backwards;

  const save = () => {
    if (!valid) return;
    onSave({
      ...existing,
      id: existing?.id ?? crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      start: dayOf(start),
      end: dayOf(end),
    });
  };

  return (
    <Dialog
      open={!!campaign}
      onClose={onClose}
      header={
        <EditorHeader
          title={existing ? t('campaigns.edit') : t('campaigns.add')}
          onDelete={existing ? onRemove : undefined}
          deleteLabel={t('common.remove')}
        />
      }
    >
      <TextField
        label={t('campaigns.name')}
        placeholder={t('campaigns.namePlaceholder')}
        value={name}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && save()}
      />
      <TextField
        label={translate('tr_eventDescription')}
        value={description}
        multiline
        minRows={2}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Stack
        direction={tablet600Up ? 'row' : 'column'}
        spacing="16px"
        sx={{ width: '100%' }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <DatePicker
            label={t('campaigns.from')}
            value={start}
            onChange={setStart}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <DatePicker
            label={t('campaigns.to')}
            value={end}
            error={backwards}
            onChange={setEnd}
          />
        </Box>
      </Stack>
      {backwards && (
        <Typography className="body-small-regular" color="var(--red-main)">
          {t('campaigns.endBeforeStart')}
        </Typography>
      )}
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="main" disabled={!valid} onClick={save}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// the settings page names it; it adds its own Add button
const Campaigns = ({ title }: { title: NavBarOptionsType }) => {
  const [, setParams] = useSearchParams();
  const [, setCampaigns] = useAtom(territoryCampaignsState);
  const [editing, setEditing] = useState<TerritoryCampaign | 'new' | null>(
    null
  );

  const remove = (campaign: TerritoryCampaign) => {
    play('remove');
    setCampaigns((prev) => prev.filter((item) => item.id !== campaign.id));
    offerUndo({
      text: t('campaigns.removed', { name: campaign.name }),
      revert: () =>
        setCampaigns((prev) =>
          prev.some((item) => item.id === campaign.id)
            ? prev
            : [...prev, campaign]
        ),
    });
  };

  return (
    <>
      <PageTitle
        {...title}
        buttons={
          !editing && (
            <NavBarButtonGroup>
              <NavBarButton
                text={t('campaigns.addButton')}
                icon={<IconAdd />}
                main
                onClick={() => setEditing('new')}
              />
            </NavBarButtonGroup>
          )
        }
      />

      <CampaignOverview onEdit={setEditing} />

      <CampaignDialog
        campaign={editing}
        onClose={() => setEditing(null)}
        onSave={(campaign) => {
          setCampaigns((previous) => upsertById(previous, campaign));
          setEditing(null);
          setParams((previous) => {
            const next = new URLSearchParams(previous);
            next.set('event', campaign.id);
            return next;
          });
        }}
        onRemove={
          editing && editing !== 'new'
            ? () => {
                remove(editing);
                setEditing(null);
                setParams((previous) => {
                  const next = new URLSearchParams(previous);
                  next.delete('event');
                  return next;
                });
              }
            : undefined
        }
      />
    </>
  );
};

export default Campaigns;
