import { ReactNode } from 'react';
import { Box } from '@mui/material';
import {
  IconAdd,
  IconRaiseHand,
  IconVisibility,
  IconAssignmetHistory,
  IconCancelCicle,
} from '@icons/index';
import { useBreakpoints, useUpNavigation } from '@hooks/index';
import { useNavigate } from 'react-router';
import { useAtomValue } from 'jotai';
import { territoryLocalModeState } from '@states/territories';
import NavBarButton from '@components/nav_bar_button';
import NavBarButtonGroup from '@components/nav_bar_button_group';
import PageTitle from '@components/page_title';
import TerritoriesHub from '@features/territories/hub';
import TerritoriesQuickSettings from '@features/territories/hub/quick_settings';
import useTerritoriesHub from '@features/territories/hub/useTerritoriesHub';
import { tx } from '@services/i18n/translation';

const Territories = () => {
  const navigate = useNavigate();

  const { tablet688Up, desktopUp } = useBreakpoints();
  const { goUp } = useUpNavigation();
  const hub = useTerritoriesHub();

  const { isTerritoryEditor } = hub;
  const localMode = useAtomValue(territoryLocalModeState);

  const isFilterSubpage = !desktopUp && hub.filtersOpen;

  const { title } = hub;

  const isMine = hub.tabId === 'mine' || hub.tabId === 'requested';

  const mineButtons = hub.canBrowse && (
    <NavBarButtonGroup>
      <NavBarButton
        text={hub.canRequest ? tx('Request') : tx('Show available territories')}
        icon={hub.canRequest ? <IconRaiseHand /> : <IconVisibility />}
        textImportant
        onClick={() => navigate('/territories?tab=recommended')}
      />
    </NavBarButtonGroup>
  );

  // the tools live on the hub itself; the requests page stays a focused review.
  // Standalone, do-not-calls and history have their own dashboard entries.
  const browseButtons = (
    <NavBarButtonGroup>
      {isTerritoryEditor && !localMode && (
        <NavBarButton
          text={tx('Do not call')}
          icon={<IconCancelCicle />}
          onClick={() =>
            navigate('/territories/do-not-calls', { state: { parent: title } })
          }
        />
      )}
      {!localMode && (
        <NavBarButton
          text={tx('History')}
          icon={<IconAssignmetHistory />}
          onClick={() =>
            navigate('/territories/history', { state: { parent: title } })
          }
        />
      )}
      {isTerritoryEditor && (
        <NavBarButton
          text={tx('Add')}
          icon={<IconAdd />}
          textImportant
          onClick={() =>
            navigate('/territories/new', { state: { parent: title } })
          }
        />
      )}
    </NavBarButtonGroup>
  );

  let buttons: ReactNode = hub.isBrowsing ? browseButtons : null;
  if (isMine) buttons = mineButtons;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        paddingBottom: tablet688Up ? '0px' : '60px',
      }}
    >
      {hub.quickSettingsOpen && (
        <TerritoriesQuickSettings
          open={hub.quickSettingsOpen}
          onClose={() => hub.setQuickSettingsOpen(false)}
          overdueMonths={hub.overdueMonths}
          onOverdueMonthsChange={hub.setOverdueMonths}
        />
      )}

      <PageTitle
        title={isFilterSubpage ? tx('Filters') : tx(title)}
        secondaryTitle={isFilterSubpage ? tx(title) : undefined}
        onBack={
          isFilterSubpage
            ? () => {
                hub.setFiltersOpen(false);
                window.scroll({ top: 0 });
              }
            : () => goUp('/')
        }
        buttons={!isFilterSubpage && buttons}
        quickSettings={() => hub.setQuickSettingsOpen(true)}
      />

      <TerritoriesHub hub={hub} />
    </Box>
  );
};

export default Territories;
