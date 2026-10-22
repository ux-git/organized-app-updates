import { Box, Stack } from '@mui/material';
import { useAppTranslation } from '@hooks/index';
import { NearbyPairMethod } from '@definition/local_sync';
import usePairDialog from './usePairDialog';
import Button from '@components/button';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import TextField from '@components/textfield';
import Typography from '@components/typography';
import WaitingLoader from '@components/waiting_loader';

type PairDialogProps = { open: boolean; onClose: VoidFunction };

const METHODS: { id: NearbyPairMethod; label: string; desc: string }[] = [
  { id: 'nearby', label: 'tr_pairNearby', desc: 'tr_pairNearbyDesc' },
  { id: 'invite', label: 'tr_pairInvite', desc: 'tr_pairInviteDesc' },
  { id: 'join', label: 'tr_pairJoin', desc: 'tr_pairJoinDesc' },
  { id: 'tap', label: 'tr_pairTap', desc: 'tr_pairTapDesc' },
];

const Code = ({ code }: { code: string }) => (
  <Typography
    className="h1"
    sx={{
      textAlign: 'center',
      letterSpacing: '0.2em',
      fontVariantNumeric: 'tabular-nums',
      padding: '8px 0',
    }}
  >
    {code.slice(0, 3)} {code.slice(3)}
  </Typography>
);

const PairDialog = ({ open, onClose }: PairDialogProps) => {
  const { t } = useAppTranslation();

  const {
    available,
    status,
    invite,
    method,
    code,
    qrImage,
    canJoin,
    handleChoose,
    handleCodeChange,
    handleJoin,
    handleBack,
  } = usePairDialog(onClose);

  const waiting =
    status.state === 'connecting' || status.state === 'exchanging';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('tr_localSyncPair')}
      description={method ? undefined : t('tr_pairChooseDesc')}
    >
      <Stack spacing="16px">
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

        {!method &&
          METHODS.map((item) => (
            <Box
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => handleChoose(item.id)}
              onKeyDown={(e) => e.key === 'Enter' && handleChoose(item.id)}
              sx={{
                border: '1px solid var(--accent-300)',
                borderRadius: 'var(--radius-l)',
                padding: '12px 16px',
                cursor: 'pointer',
                '&:hover': { backgroundColor: 'var(--accent-100)' },
              }}
            >
              <Typography className="body-regular">{t(item.label)}</Typography>
              <Typography
                className="label-small-regular"
                color="var(--grey-350)"
              >
                {t(item.desc)}
              </Typography>
            </Box>
          ))}

        {method === 'nearby' && (
          <Stack spacing="8px" sx={{ alignItems: 'center' }}>
            {status.state === 'confirm' && status.code ? (
              <>
                <Typography>
                  {t('tr_pairCompareCode', { name: status.name })}
                </Typography>
                <Code code={status.code} />
              </>
            ) : (
              <>
                <Typography color="var(--grey-400)">
                  {t('tr_pairNearbyWaiting')}
                </Typography>
                {waiting && <WaitingLoader />}
              </>
            )}
          </Stack>
        )}

        {method === 'invite' && (
          <Stack spacing="8px" sx={{ alignItems: 'center' }}>
            <Typography color="var(--grey-400)">
              {t('tr_pairInviteShow')}
            </Typography>
            {qrImage ? (
              <img src={qrImage} alt="" width={240} height={240} />
            ) : (
              <Box
                sx={{
                  width: 240,
                  height: 240,
                  borderRadius: 'var(--radius-l)',
                  border: '1px dashed var(--accent-300)',
                }}
              />
            )}
            {invite?.code && <Code code={invite.code} />}
          </Stack>
        )}

        {method === 'join' && (
          <Stack spacing="12px">
            <Typography color="var(--grey-400)">
              {t('tr_pairJoinType')}
            </Typography>
            <TextField
              label={t('tr_pairCode')}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }}
            />
          </Stack>
        )}

        {method === 'tap' && (
          <Stack spacing="8px" sx={{ alignItems: 'center' }}>
            <Typography color="var(--grey-400)">
              {t('tr_pairTapHold')}
            </Typography>
            {waiting && <WaitingLoader />}
          </Stack>
        )}

        {status.state === 'failed' && method && (
          <Typography
            className="label-small-regular"
            sx={{ color: 'var(--red-main)' }}
          >
            {t('tr_nearbyFailed', { reason: status.reason })}
          </Typography>
        )}
      </Stack>

      <DialogActions>
        {method ? (
          <Button variant="secondary" onClick={handleBack}>
            {t('tr_back')}
          </Button>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            {t('tr_cancel')}
          </Button>
        )}
        {method === 'join' && (
          <Button
            variant="main"
            disabled={!available || !canJoin}
            onClick={handleJoin}
          >
            {t('tr_pairJoinBtn')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default PairDialog;
