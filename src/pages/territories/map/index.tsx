import { useState } from 'react';
import { Box } from '@mui/material';
import { useUpNavigation } from '@hooks/index';
import PageTitle from '@components/page_title';
import { tx } from '@services/i18n/translation';
import TerritoriesMap from '@features/territories/map';
import useTerritoriesMap from '@features/territories/map/useTerritoriesMap';
import MapQuickSettings from '@features/territories/map/quick_settings';
import { PrintOverviewDialog } from '@features/territories/map/print_overview';
import NavBarButton from '@components/nav_bar_button';
import NavBarButtonGroup from '@components/nav_bar_button_group';
import { IconPrint } from '@icons/index';
import { useAtomValue } from 'jotai';
import {
  congregationBorderColorState,
  congregationBorderDashedState,
  congregationBoundaryState,
} from '@states/territories';

const TerritoryMapPage = () => {
  const map = useTerritoriesMap();

  const { editor } = map;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const congregation = useAtomValue(congregationBoundaryState);
  const borderColor = useAtomValue(congregationBorderColorState);
  const borderDashed = useAtomValue(congregationBorderDashedState);

  const { goUp } = useUpNavigation();

  let title = tx('Territory coverage map');
  if (editor.editing) {
    title =
      editor.scope === 'congregation'
        ? tx('Congregation area')
        : tx('Territory {{number}} map', {
            number: map.selected?.number ?? '',
          });
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PageTitle
        title={title}
        secondaryTitle={
          editor.editing ? tx('Territory coverage map') : undefined
        }
        onBack={editor.editing ? map.leaveTerritory : () => goUp('/')}
        quickSettings={editor.editing ? undefined : () => setSettingsOpen(true)}
        buttons={
          editor.editing ? undefined : (
            <NavBarButtonGroup>
              <NavBarButton
                main
                text={tx('Print map')}
                icon={<IconPrint />}
                onClick={() => setPrinting(true)}
              />
            </NavBarButtonGroup>
          )
        }
      />

      {printing && (
        <PrintOverviewDialog
          open
          onClose={() => setPrinting(false)}
          territories={map.territories}
          areas={map.printAreas()}
          congregation={congregation}
          borderColor={borderColor}
          borderDashed={borderDashed}
        />
      )}

      {settingsOpen && (
        <MapQuickSettings
          map={map}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <TerritoriesMap map={map} />
    </Box>
  );
};

export default TerritoryMapPage;
