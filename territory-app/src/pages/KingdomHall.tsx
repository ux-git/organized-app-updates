import { useState } from 'react';
import { Box } from '@mui/material';
import Button from '@components/button';
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
import useNearby from './useNearby';

const KingdomHall = () => {
  const { status } = useNearby();
  const [picking, setPicking] = useState(false);
  const permissions = status.permissions;

  const buttons = { display: 'flex', gap: '8px', flexWrap: 'wrap' } as const;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PageTitle title="Kingdom Hall" />

      <CardSection>
        <CardSectionHeader
          title="Kingdom Hall"
          description="Optional. When you arrive at the Kingdom Hall, this phone starts looking for paired phones, even outside meeting times. The location stays on this phone."
        />
        <CardSectionContent>
          <Typography className="body-regular">
            {status.hall ? 'Location saved' : 'No location saved yet'}
          </Typography>
          <Box sx={buttons}>
            <Button
              variant="secondary"
              disableAutoStretch
              onClick={() => setPicking(true)}
            >
              {status.hall ? 'Change on map' : 'Choose on map'}
            </Button>
            <Button
              variant="tertiary"
              disableAutoStretch
              onClick={() => nearby('hallHere', { radius: 150 })}
            >
              Use current location
            </Button>
            {status.hall && (
              <Button
                variant="tertiary"
                color="red"
                disableAutoStretch
                onClick={() => {
                  play('remove');
                  nearby('hallClear');
                }}
              >
                Remove location
              </Button>
            )}
          </Box>
          {status.hall &&
            permissions?.location &&
            !permissions.backgroundLocation && (
              <Box
                sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <Typography
                  className="body-small-regular"
                  color="var(--grey-400)"
                >
                  To notice your arrival with the app closed, Android needs
                  location access all the time.
                </Typography>
                <Box>
                  <Button
                    variant="secondary"
                    disableAutoStretch
                    onClick={() =>
                      nearby('permissions', { which: 'backgroundLocation' })
                    }
                  >
                    Allow location all the time
                  </Button>
                </Box>
              </Box>
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
