import { useState } from 'react';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { play } from '../haptics';
import { nearby } from '../native';
import { t } from '../i18n';
import { confirm } from './confirm';
import HallPicker from './HallPicker';
import { Actions } from './sync/parts';
import { NearbyStatus } from './useNearby';

// location access is asked for with the sync mode that needs it (AutomaticSection)
const KingdomHall = ({ status }: { status: NearbyStatus }) => {
  const [picking, setPicking] = useState(false);

  return (
    <>
      <CardSection id="hall">
        <CardSectionHeader
          title={t('common.kingdomHall')}
          description={t('hall.text')}
        />
        <CardSectionContent>
          <Typography className="body-regular">
            {status.hall ? t('hall.saved') : t('hall.none')}
          </Typography>
          <Actions
            actions={[
              {
                label: status.hall ? t('hall.change') : t('hall.choose'),
                kind: 'main',
                onClick: () => setPicking(true),
              },
              {
                label: t('hall.here'),
                onClick: () => nearby('hallHere', { radius: 150 }),
              },
              ...(status.hall
                ? [
                    {
                      label: t('hall.remove'),
                      kind: 'remove' as const,
                      onClick: async () => {
                        const ok = await confirm({
                          title: t('hall.removeTitle'),
                          description: t('hall.removeText'),
                          action: t('common.remove'),
                        });
                        if (!ok) return;
                        play('remove');
                        nearby('hallClear');
                      },
                    },
                  ]
                : []),
            ]}
          />
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
    </>
  );
};

export default KingdomHall;
