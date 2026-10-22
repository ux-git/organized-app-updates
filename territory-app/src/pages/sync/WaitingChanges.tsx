import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAtomValue } from 'jotai';
import { Box, ButtonBase } from '@mui/material';
import { IconCloudDone, IconCloudUpload } from '@icons/index';
import Button from '@components/button';
import Typography from '@components/typography';
import { CardSection } from '@features/congregation/settings/shared_styles';
import { appLocaleState } from '@states/app';
import { list, t } from '../../i18n';
import useNearby, { unsynced } from '../useNearby';
import { fieldLabel, time, title } from './text';
import useWaiting, { seconds, WaitingItem } from './useWaiting';
import KindIcon from './KindIcon';
import { Kind, kindLabel, kindOf, KINDS, kindTint } from './waitingKinds';

const FIELDS_SHOWN = 4;

const dayOf = (item: WaitingItem, locale: string) => {
  const date = new Date(seconds(item.stamp) * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return t('time.today');
  if (date.toDateString() === yesterday.toDateString()) {
    return t('waiting.yesterday');
  }
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

const Chip = ({ text, tint }: { text: string; tint?: string }) => (
  <Box
    component="span"
    sx={{
      padding: '2px 8px',
      borderRadius: '999px',
      backgroundColor: tint
        ? `color-mix(in srgb, ${tint} 14%, transparent)`
        : 'var(--accent-150)',
      color: tint ?? 'var(--accent-dark)',
    }}
    className="label-small-medium"
  >
    {text}
  </Box>
);

const Row = ({ item }: { item: WaitingItem }) => {
  const kind = kindOf(item.table);
  const fields = item.fields.map(fieldLabel);

  return (
    <Box sx={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <Box
        sx={{
          flexShrink: 0,
          width: '36px',
          height: '36px',
          borderRadius: 'var(--radius-m)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `color-mix(in srgb, ${kindTint[kind]} 12%, transparent)`,
        }}
      >
        <KindIcon kind={kind} />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
          <Typography
            className="body-small-semibold"
            sx={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title(item)}
          </Typography>
          <Typography className="label-small-regular" color="var(--grey-400)">
            {time(new Date(seconds(item.stamp) * 1000))}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            marginTop: '6px',
          }}
        >
          {item.deleted && (
            <Chip text={t('changes.deleted')} tint="var(--red-main)" />
          )}
          {!item.deleted && item.added && (
            <Chip text={t('waiting.new')} tint="var(--green-main)" />
          )}
          {!item.deleted &&
            !item.added &&
            fields
              .slice(0, FIELDS_SHOWN)
              .map((field) => <Chip key={field} text={field} />)}
          {!item.deleted && !item.added && fields.length > FIELDS_SHOWN && (
            <Chip text={`+${fields.length - FIELDS_SHOWN}`} />
          )}
        </Box>
      </Box>
    </Box>
  );
};

/** This device's own edits that a paired device doesn't have yet. */
const WaitingChanges = () => {
  const navigate = useNavigate();
  const { peers } = useNearby();
  const mine = useWaiting(unsynced(peers)).filter((item) => item.mine);
  const [filter, setFilter] = useState<Kind | 'all'>('all');
  const locale = useAtomValue(appLocaleState);

  const behind = peers.filter((peer) => peer.last_sync && peer.pending > 0);
  const present = KINDS.filter((kind) =>
    mine.some((item) => kindOf(item.table) === kind)
  );
  const shown =
    filter === 'all'
      ? mine
      : mine.filter((item) => kindOf(item.table) === filter);

  const days: { day: string; items: WaitingItem[] }[] = [];
  for (const item of shown) {
    const day = dayOf(item, locale.code);
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }

  if (!mine.length) {
    return (
      <CardSection
        sx={{
          alignItems: 'center',
          textAlign: 'center',
          gap: '8px',
          padding: '40px 16px',
        }}
      >
        <IconCloudDone color="var(--green-main)" width={40} height={40} />
        <Typography className="h3">{t('waiting.allSynced')}</Typography>
        <Typography className="body-small-regular" color="var(--grey-400)">
          {t('waiting.allSyncedText')}
        </Typography>
      </CardSection>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <CardSection
        sx={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: '16px',
          background:
            'linear-gradient(135deg, var(--accent-150), var(--accent-100))',
          border: '1px solid var(--accent-200)',
        }}
      >
        <Box
          sx={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'var(--white)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <IconCloudUpload color="var(--accent-main)" width={26} height={26} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography className="h2" color="var(--accent-dark)">
            {t('waiting.summary', { count: mine.length })}
          </Typography>
          <Typography className="body-small-regular" color="var(--grey-400)">
            {behind.length
              ? t('waiting.goesTo', {
                  count: behind.length,
                  names: list(
                    behind.map((peer) => peer.name || t('common.theOtherPhone'))
                  ),
                })
              : t('sync.waitingText')}
          </Typography>
          <Box sx={{ display: 'flex', marginTop: '8px', marginLeft: '-8px' }}>
            <Button
              variant="small"
              disableAutoStretch
              onClick={() => navigate('/settings/sync')}
            >
              {t('waiting.toSync')}
            </Button>
          </Box>
        </Box>
      </CardSection>

      {present.length > 1 && (
        <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(['all', ...present] as const).map((kind) => {
            const active = filter === kind;
            const n =
              kind === 'all'
                ? mine.length
                : mine.filter((item) => kindOf(item.table) === kind).length;
            return (
              <ButtonBase
                key={kind}
                onClick={() => setFilter(kind)}
                aria-pressed={active}
                className="body-small-semibold"
                sx={{
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '999px',
                  border: '1px solid',
                  borderColor: active
                    ? 'var(--accent-main)'
                    : 'var(--accent-300)',
                  backgroundColor: active
                    ? 'var(--accent-main)'
                    : 'var(--white)',
                  color: active ? 'var(--always-white)' : 'var(--black)',
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                }}
              >
                {kind === 'all' ? t('waiting.all') : kindLabel(kind)}
                <Box component="span" sx={{ opacity: 0.7 }}>
                  {n}
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      )}

      {days.map(({ day, items }) => (
        <CardSection key={day} sx={{ gap: '16px' }}>
          <Typography className="body-small-semibold" color="var(--grey-400)">
            {day}
          </Typography>
          {items.map((item, index) => (
            <Box key={`${item.table}/${item.record}`}>
              {index > 0 && (
                <Box
                  sx={{
                    height: '1px',
                    backgroundColor: 'var(--accent-200)',
                    margin: '0 0 16px 48px',
                  }}
                />
              )}
              <Row item={item} />
            </Box>
          ))}
        </CardSection>
      ))}
    </Box>
  );
};

export default WaitingChanges;
