import { useMemo, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Box, Stack } from '@mui/material';
import { IconAdd, IconChevronRight, IconDelete } from '@icons/index';
import Button from '@components/button';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import IconButton from '@components/icon_button';
import NavBarButton from '@components/nav_bar_button';
import NavBarButtonGroup from '@components/nav_bar_button_group';
import PageTitle from '@components/page_title';
import TextField from '@components/textfield';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import EditorHeader from '@features/territories/components/editor_header';
import { HOVER_ACTIONS } from '@features/territories/components/table_styles';
import { useBreakpoints } from '@hooks/index';
import { NavBarOptionsType } from '@definition/app';
import { TerritoryCampaign } from '@definition/territory';
import { appLocaleState } from '@states/app';
import {
  campaignRange,
  dateOf,
  dayOf,
} from '@features/territories/campaign_dates';
import { upsertById } from '@features/territories/helpers';
import { territoryCampaignsState } from '../campaigns';
import { play } from '../haptics';
import { confirm } from './confirm';
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
  const existing = campaign && campaign !== 'new' ? campaign : null;
  const [name, setName] = useState('');
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [shown, setShown] = useState<typeof campaign>(null);

  if (campaign !== shown) {
    setShown(campaign);
    setName(existing?.name ?? '');
    setStart(existing ? dateOf(existing.start) : new Date());
    setEnd(existing ? dateOf(existing.end) : new Date());
  }

  const backwards = !!start && !!end && dayOf(end) < dayOf(start);
  const valid = !!name.trim() && !!start && !!end && !backwards;

  const save = () => {
    if (!valid) return;
    onSave({
      id: existing?.id ?? crypto.randomUUID(),
      name: name.trim(),
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
  const { tablet688Up } = useBreakpoints();
  const [campaigns, setCampaigns] = useAtom(territoryCampaignsState);
  const locale = useAtomValue(appLocaleState);
  const [editing, setEditing] = useState<TerritoryCampaign | 'new' | null>(
    null
  );

  const sorted = useMemo(
    () => [...campaigns].sort((a, b) => b.start.localeCompare(a.start)),
    [campaigns]
  );

  const remove = async (campaign: TerritoryCampaign) => {
    const ok = await confirm({
      title: t('campaigns.removeTitle', { name: campaign.name }),
      description: t('campaigns.removeText'),
      action: t('common.remove'),
    });
    if (!ok) return false;
    play('remove');
    setCampaigns(campaigns.filter((item) => item.id !== campaign.id));
    return true;
  };

  return (
    <>
      <PageTitle
        {...title}
        buttons={
          <NavBarButtonGroup>
            <NavBarButton
              text={t('campaigns.addButton')}
              icon={<IconAdd />}
              main
              onClick={() => setEditing('new')}
            />
          </NavBarButtonGroup>
        }
      />

      <CardSection>
        <CardSectionHeader
          title={t('campaigns.title')}
          description={t('campaigns.shortText')}
        />
        {sorted.length === 0 ? (
          <Typography className="body-regular" color="var(--grey-400)">
            {t('campaigns.none')}
          </Typography>
        ) : (
          <Stack spacing="2px">
            {sorted.map((campaign) => (
              <Box
                key={campaign.id}
                role="button"
                tabIndex={0}
                onClick={() => setEditing(campaign)}
                onKeyDown={(event) =>
                  event.key === 'Enter' && setEditing(campaign)
                }
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '6px 8px',
                  marginInline: '-8px',
                  borderRadius: 'var(--radius-l)',
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: 'var(--accent-150)' },
                  ...HOVER_ACTIONS,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography className="body-regular">
                    {campaign.name}
                  </Typography>
                  <Typography
                    className="body-small-regular"
                    color="var(--grey-400)"
                  >
                    {campaignRange(campaign, locale.code)}
                  </Typography>
                </Box>
                {/* on a phone the row is the button; removing waits in the dialog */}
                {tablet688Up ? (
                  <IconButton
                    className="row-actions"
                    color="error"
                    edge="end"
                    aria-label={t('campaigns.removeLabel', {
                      name: campaign.name,
                    })}
                    onClick={(event) => {
                      event.stopPropagation();
                      remove(campaign);
                    }}
                  >
                    <IconDelete color="var(--red-main)" />
                  </IconButton>
                ) : (
                  <IconChevronRight
                    color="var(--grey-350)"
                    width={20}
                    height={20}
                    sx={{ flexShrink: 0 }}
                  />
                )}
              </Box>
            ))}
          </Stack>
        )}
      </CardSection>

      <CampaignDialog
        campaign={editing}
        onClose={() => setEditing(null)}
        onSave={(campaign) => {
          setCampaigns(upsertById(campaigns, campaign));
          setEditing(null);
        }}
        onRemove={
          editing && editing !== 'new'
            ? async () => {
                if (await remove(editing)) setEditing(null);
              }
            : undefined
        }
      />
    </>
  );
};

export default Campaigns;
