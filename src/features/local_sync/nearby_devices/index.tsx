import { Box, Stack } from '@mui/material';
import { IconComputer, IconDelete, IconPhone } from '@components/icons';
import { useAppTranslation } from '@hooks/index';
import { NearbyPeer, NearbyStatus } from '@definition/local_sync';
import useNearbyDevices from './useNearbyDevices';
import PairDialog from '../pair_dialog';
import Button from '@components/button';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import MiniChip from '@components/mini_chip';
import SwitchWithLabel from '@components/switch_with_label';
import Typography from '@components/typography';
import { formatDate } from '@utils/date';

const DeviceIcon = ({ platform }: { platform: NearbyPeer['platform'] }) => {
  if (platform === 'mac' || platform === 'windows' || platform === 'web') {
    return <IconComputer color="var(--accent-main)" />;
  }

  return <IconPhone color="var(--accent-main)" />;
};

const statusText = (
  status: NearbyStatus,
  t: (key: string, options?: Record<string, unknown>) => string
) => {
  switch (status.state) {
    case 'connecting':
      return t('tr_nearbyConnecting', { name: status.name ?? '' });
    case 'exchanging':
      return t('tr_nearbyExchanging', { name: status.name });
    case 'done':
      return t('tr_nearbyDone', {
        name: status.name,
        sent: status.sent,
        received: status.received,
      });
    case 'failed':
      return t('tr_nearbyFailed', { reason: status.reason });
    default:
      return '';
  }
};

const NearbyDevices = () => {
  const { t } = useAppTranslation();

  const {
    available,
    peers,
    status,
    automatic,
    busy,
    pairOpen,
    unpairing,
    handleSyncNow,
    handleToggleAutomatic,
    handleOpenPair,
    handleClosePair,
    handleUnpair,
    handleUnpairCancel,
    handleUnpairConfirm,
  } = useNearbyDevices();

  const text = statusText(status, t);

  return (
    <Stack spacing="12px">
      <Typography className="h3">{t('tr_localSyncNearby')}</Typography>
      <Typography color="var(--grey-400)">
        {t('tr_localSyncNearbyDesc')}
      </Typography>

      {!available && (
        <Box
          sx={{
            border: '1px solid var(--accent-300)',
            backgroundColor: 'var(--accent-100)',
            borderRadius: 'var(--radius-l)',
            padding: '12px 16px',
          }}
        >
          <Typography className="body-regular">
            {t('tr_nearbyNeedsApp')}
          </Typography>
          <Typography className="label-small-regular" color="var(--grey-400)">
            {t('tr_nearbyNeedsAppDesc')}
          </Typography>
        </Box>
      )}

      {pairOpen && <PairDialog open={pairOpen} onClose={handleClosePair} />}

      {unpairing && (
        <Dialog
          open={!!unpairing}
          onClose={handleUnpairCancel}
          title={t('tr_nearbyUnpair')}
          description={t('tr_nearbyUnpairDesc')}
        >
          <DialogActions>
            <Button variant="secondary" onClick={handleUnpairCancel}>
              {t('tr_cancel')}
            </Button>
            <Button variant="main" color="red" onClick={handleUnpairConfirm}>
              {t('tr_nearbyUnpair')}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {peers.length === 0 ? (
        <Typography color="var(--grey-400)">
          {t('tr_nearbyNoDevices')}
        </Typography>
      ) : (
        <Stack
          sx={{
            border: '1px solid var(--accent-300)',
            borderRadius: 'var(--radius-l)',
            overflow: 'hidden',
          }}
        >
          {peers.map((peer) => (
            <Box
              key={peer.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderBottom: '1px solid var(--accent-200)',
                '&:last-child': { borderBottom: 0 },
              }}
            >
              <DeviceIcon platform={peer.platform} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography className="body-regular">{peer.name}</Typography>
                <Typography
                  className="label-small-regular"
                  color="var(--grey-350)"
                >
                  {peer.last_sync
                    ? t('tr_nearbyLastSync', {
                        date: formatDate(
                          new Date(peer.last_sync),
                          'dd.MM.yyyy HH:mm'
                        ),
                      })
                    : t('tr_nearbyNeverSynced')}
                </Typography>
              </Box>
              {peer.pending > 0 && (
                <MiniChip
                  label={t('tr_nearbyPending', { count: peer.pending })}
                />
              )}
              <Button
                variant="small"
                disabled={!available || busy}
                onClick={() => handleSyncNow(peer.id)}
                sx={{ minHeight: '28px', height: '28px' }}
              >
                {t('tr_localSyncNow')}
              </Button>
              <Button
                variant="small"
                color="red"
                disableAutoStretch
                onClick={() => handleUnpair(peer.id)}
                sx={{ minHeight: '28px', height: '28px', minWidth: '28px' }}
              >
                <IconDelete color="var(--red-main)" />
              </Button>
            </Box>
          ))}
        </Stack>
      )}

      {text && (
        <Typography
          className="label-small-regular"
          sx={{
            color:
              status.state === 'failed' ? 'var(--red-main)' : 'var(--grey-400)',
          }}
        >
          {text}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Button
          variant="main"
          disabled={!available || busy || peers.length === 0}
          onClick={() => handleSyncNow()}
        >
          {t('tr_localSyncNow')}
        </Button>
        <Button variant="secondary" onClick={handleOpenPair}>
          {t('tr_localSyncPair')}
        </Button>
      </Box>

      <SwitchWithLabel
        label={t('tr_nearbyAutomatic')}
        helper={t('tr_nearbyAutomaticDesc')}
        checked={automatic}
        onChange={handleToggleAutomatic}
        readOnly={!available}
      />
    </Stack>
  );
};

export default NearbyDevices;
