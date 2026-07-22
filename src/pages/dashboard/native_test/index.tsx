import { useState } from 'react';
import { Box } from '@mui/material';
import Button from '@components/button';
import Typography from '@components/typography';
import { isTauriNative } from '@utils/native';

const ACTION_TYPE_ID = 'organized-test-actions';
const CHANNEL_ID = 'organized-test';

/**
 * Test button for native push notifications (Tauri Android build only).
 * Rendered at the very bottom of the home dashboard.
 */
const NativeNotificationTest = () => {
  const [status, setStatus] = useState('');

  const handleTestNotification = async () => {
    try {
      const {
        isPermissionGranted,
        requestPermission,
        sendNotification,
        registerActionTypes,
        createChannel,
        Importance,
        Visibility,
      } = await import('@tauri-apps/plugin-notification');

      let granted = await isPermissionGranted();

      if (!granted) {
        const permission = await requestPermission();
        granted = permission === 'granted';
      }

      if (!granted) {
        setStatus('Notification permission denied');
        return;
      }

      await registerActionTypes([
        {
          id: ACTION_TYPE_ID,
          actions: [
            { id: 'view-assignments', title: 'View assignments' },
            { id: 'dismiss', title: 'Dismiss', destructive: true },
          ],
        },
      ]);

      await createChannel({
        id: CHANNEL_ID,
        name: 'Test notifications',
        description: 'Test notifications from the Organized app',
        importance: Importance.High,
        visibility: Visibility.Public,
        lights: true,
        vibration: true,
      });

      sendNotification({
        channelId: CHANNEL_ID,
        actionTypeId: ACTION_TYPE_ID,
        title: 'Organized App',
        body: 'You have 3 upcoming meeting assignments this week. Tap to review your schedule.',
        summary: 'Assignments',
        icon: 'ic_notification',
        largeBody:
          'You have 3 upcoming meeting assignments this week:\n• Bible Reading — Tuesday\n• Starting a Conversation — Tuesday\n• Watchtower Reader — Sunday\nTap to open your schedule in the Organized app.',
        group: 'organized-test',
        autoCancel: true,
      });

      setStatus('Notification sent ✓');
    } catch (err) {
      setStatus(`Notification error: ${String(err)}`);
    }
  };

  if (!isTauriNative()) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        marginTop: '8px',
      }}
    >
      <Button variant="tertiary" onClick={handleTestNotification}>
        Test push notification
      </Button>

      {status && (
        <Typography className="body-small-regular" color="var(--grey-400)">
          {status}
        </Typography>
      )}
    </Box>
  );
};

export default NativeNotificationTest;
