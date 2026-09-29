import { useState } from 'react';
import { Box } from '@mui/material';
import { useUpNavigation } from '@hooks/index';
import PageTitle from '@components/page_title';
import { tx } from '@services/i18n/translation';
import TerritoriesMap from '@features/territories/map';
import useTerritoriesMap from '@features/territories/map/useTerritoriesMap';
import MapQuickSettings from '@features/territories/map/quick_settings';

const TerritoryMapPage = () => {
  const map = useTerritoriesMap();

  const { editor } = map;

  const [settingsOpen, setSettingsOpen] = useState(false);

  const { goUp } = useUpNavigation();

  let title = tx('Territory coverage map');
  if (editor.editing) {
    title =
      editor.scope === 'congregation'
        ? tx('Congregation border')
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
      />

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
