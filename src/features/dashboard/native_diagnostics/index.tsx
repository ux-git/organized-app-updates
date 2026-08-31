import { useState } from 'react';
import { Box, Stack } from '@mui/material';
import Button from '@components/button';
import Typography from '@components/typography';
import { APP_ENVIRONMENT } from '@constants/index';
import { can, isNative, platform } from '@platform/index';
import * as biometric from '@platform/adapters/biometric';
import * as calendar from '@platform/adapters/calendar';
import * as clipboard from '@platform/adapters/clipboard';
import * as files from '@platform/adapters/files';
import * as haptics from '@platform/adapters/haptics';
import * as notify from '@platform/adapters/notify';

type Check = {
  label: string;
  /** Capability this exercises; undefined means it works everywhere. */
  needs?: Parameters<typeof can>[0];
  run: () => Promise<string>;
};

const CHECKS: Check[] = [
  {
    label: 'Haptic tap',
    needs: 'haptics',
    run: async () => {
      await haptics.impact('medium');
      return 'impact sent';
    },
  },
  {
    label: 'Haptic success',
    needs: 'haptics',
    run: async () => {
      await haptics.notify('success');
      return 'success pattern sent';
    },
  },
  {
    label: 'Notification',
    run: async () => {
      if (!(await notify.ensurePermission())) return 'permission refused';

      await notify.showNotification({
        title: 'Organized',
        body: 'A plain notification, no actions.',
      });
      return 'posted';
    },
  },
  {
    label: 'Notification with buttons',
    needs: 'notification-actions',
    run: async () => {
      if (!(await notify.ensurePermission())) return 'permission refused';

      await notify.registerActionTypes([
        {
          id: 'diagnostics',
          actions: [
            { id: 'open', title: 'Open' },
            { id: 'later', title: 'Later' },
          ],
        },
      ]);
      await notify.showNotification({
        title: 'Organized',
        body: 'This one should carry Open and Later.',
        actionTypeId: 'diagnostics',
      });
      return 'posted — pull down the shade to see the buttons';
    },
  },
  {
    label: 'Biometric prompt',
    needs: 'biometric',
    run: async () => {
      if (!(await biometric.isBiometricAvailable())) return 'not enrolled';

      // the native path drives the OS prompt and ignores the identifier
      const ok = await biometric.verifyBiometric('diagnostics');
      return ok ? 'verified' : 'dismissed or failed';
    },
  },
  {
    label: 'Add calendar event',
    run: async () => {
      const start = new Date();
      start.setDate(start.getDate() + 1);
      start.setHours(19, 0, 0, 0);

      const end = new Date(start);
      end.setHours(20, 30, 0, 0);

      await calendar.addToCalendar({
        uid: `diagnostics-${start.getTime()}`,
        title: 'Organized diagnostics event',
        description: 'Created by the native feature check.',
        start,
        end,
        allDay: false,
      });
      return can('calendar-write') ? 'handed to the OS' : 'downloaded .ics';
    },
  },
  {
    label: 'Save a file',
    run: async () => {
      await files.saveFile(
        new Blob(['Organized native diagnostics\n'], { type: 'text/plain' }),
        'organized-diagnostics.txt'
      );
      return can('file-share') ? 'handed to the OS' : 'downloaded';
    },
  },
  {
    label: 'Copy to clipboard',
    run: async () => {
      await clipboard.writeText('Organized native diagnostics');
      return 'copied — paste somewhere to confirm';
    },
  },
  {
    label: 'Read safe area',
    run: async () => {
      const style = getComputedStyle(document.documentElement);
      const read = (side: string) =>
        style.getPropertyValue(`--safe-area-${side}`).trim() || '0px';

      return `top ${read('top')}, bottom ${read('bottom')}, left ${read('left')}, right ${read('right')}`;
    },
  },
];

/**
 * Exercises each native integration from inside the running app.
 *
 * Several of these cannot be verified anywhere but on a device — a haptic
 * pattern, an OS biometric prompt, whether the system bar insets actually
 * reached the web layer — so they need a way to be triggered by hand.
 *
 * Only ever rendered in a test build or a native shell.
 */
const NativeDiagnostics = () => {
  const [results, setResults] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>();

  if (APP_ENVIRONMENT !== 'TEST' && !isNative()) return null;

  const handleRun = async (check: Check) => {
    setBusy(check.label);

    try {
      const outcome = await check.run();
      setResults((current) => ({ ...current, [check.label]: outcome }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [check.label]: `failed: ${(error as Error).message}`,
      }));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Box
      sx={{
        padding: '16px',
        borderRadius: 'var(--radius-xl)',
        border: '1px dashed var(--accent-300)',
        backgroundColor: 'var(--white)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <Box>
        <Typography className="h3">Native feature check</Typography>
        <Typography className="body-small-regular" color="var(--grey-350)">
          Running on {platform()}
          {isNative() ? ' (native shell)' : ' (browser)'}. Greyed-out checks are
          not supported by this host.
        </Typography>
      </Box>

      <Stack spacing="8px">
        {CHECKS.map((check) => {
          const supported = !check.needs || can(check.needs);
          const result = results[check.label];

          return (
            <Box
              key={check.label}
              sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
            >
              <Button
                variant="secondary"
                disabled={!supported || busy === check.label}
                onClick={() => handleRun(check)}
              >
                {check.label}
              </Button>

              {(result || !supported) && (
                <Typography
                  className="body-small-regular"
                  color={
                    result?.startsWith('failed')
                      ? 'var(--red-main)'
                      : 'var(--grey-350)'
                  }
                  sx={{ paddingLeft: '4px' }}
                >
                  {supported ? result : 'not available on this host'}
                </Typography>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

export default NativeDiagnostics;
