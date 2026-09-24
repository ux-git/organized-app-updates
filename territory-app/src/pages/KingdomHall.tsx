import { useState } from 'react';
import { Box, Stack } from '@mui/material';
import PageTitle from '@components/page_title';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { play } from '../haptics';
import { nearby } from '../native';
import HallPicker from './HallPicker';
import { Actions } from './sync/parts';
import useNearby from './useNearby';

const KingdomHall = () => {
  const { status } = useNearby();
  const [picking, setPicking] = useState(false);
  const permissions = status.permissions;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PageTitle title="Kingdom Hall" />

      <CardSection>
        <CardSectionHeader
          title="Kingdom Hall"
          description="Used when your phone syncs only at the Kingdom Hall. The location stays on this phone."
        />
        <CardSectionContent>
          <Typography className="body-regular">
            {status.hall ? 'Location saved' : 'No location saved yet'}
          </Typography>
          <Actions
            actions={[
              {
                label: status.hall ? 'Change on map' : 'Choose on map',
                kind: 'main',
                onClick: () => setPicking(true),
              },
              {
                label: 'Use current location',
                onClick: () => nearby('hallHere', { radius: 150 }),
              },
              ...(status.hall
                ? [
                    {
                      label: 'Remove location',
                      kind: 'remove' as const,
                      onClick: () => {
                        play('remove');
                        nearby('hallClear');
                      },
                    },
                  ]
                : []),
            ]}
          />
          {status.hall &&
            status.mode === 'location' &&
            !(permissions?.location && permissions.backgroundLocation) && (
              <Stack spacing="8px">
                <Typography
                  className="body-small-regular"
                  color="var(--grey-400)"
                >
                  To notice your arrival with the app closed, your phone needs
                  location access all the time.
                </Typography>
                <Actions
                  actions={[
                    {
                      label: 'Allow location all the time',
                      kind: 'main',
                      onClick: () =>
                        nearby('permissions', {
                          which: permissions?.location
                            ? 'backgroundLocation'
                            : 'location',
                        }),
                    },
                  ]}
                />
              </Stack>
            )}
        </CardSectionContent>
      </CardSection>

      <HallPicker
        open={picking}
        hall={status.hall}
        onClose={() => {
          setPicking(false);
          nearby('status');
        }}
      />
    </Box>
  );
};

export default KingdomHall;
