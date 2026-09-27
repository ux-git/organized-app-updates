import { useLayoutEffect, useState } from 'react';
import { Box, Stack } from '@mui/material';
import { Button, CustomDivider } from '@components/index';
import TabSwitcher from '@components/tab_switcher';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import { useNavigate } from 'react-router';
import { useBreakpoints } from '@hooks/index';
import { systemBarInset } from '@utils/common';
import { tx } from '@services/i18n/translation';
import {
  IconAdd,
  IconEdit,
  IconFullscreen,
  IconFullscreenExit,
  IconMapOverview,
  IconMyLocation,
  IconPanelClose,
  IconPanelOpen,
  IconRemove,
  IconVisibility,
} from '@icons/index';
import EditToolbar, { IdleToolbar, ViewToolbar } from './edit_toolbar';
import EditPanel from './edit_panel';
import LabelDialog from './label_dialog';
import MapFilters from './map_filters';
import MapIsland, { MapAction, NorthAction } from './map_island';
import TerritoryPicker from './territory_picker';
import { TerritoriesMapState } from './useTerritoriesMap';
import 'maplibre-gl/dist/maplibre-gl.css';

const PANEL_WIDTH = 320;

// Organized's subpage slide (the settings redesign)
const SLIDE = '340ms cubic-bezier(0.32, 0.72, 0, 1)';

const BOTTOM_GAP = 16;

// maplibre's info icon, redrawn as a mask so it takes the accent color
const INFO_ICON =
  'url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22%3E%3Cpath fill-rule=%22evenodd%22 d=%22M4 10a6 6 0 1 0 12 0 6 6 0 1 0-12 0m5-3a1 1 0 1 0 2 0 1 1 0 1 0-2 0m0 3a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0%22/%3E%3C/svg%3E")';

// the attribution sits in the map's bottom-left corner like the other map
// buttons, and opens to the right so it never runs off the map
// OSM's attribution guidelines: legible, in a corner, shown when the map loads
// (MapLibre's compact control opens at first and folds into the button)
const ATTRIBUTION_STYLES = {
  '& .maplibregl-ctrl-bottom-left': { left: '12px', bottom: '12px' },
  '& .maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib.maplibregl-compact': {
    margin: 0,
    // 24 × 24 folded, border included
    height: '24px',
    minHeight: '24px',
    padding: '0 0 0 22px',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    borderRadius: 'var(--radius-max)',
    border: '1px solid var(--accent-200)',
    backgroundColor: 'rgba(var(--white-base), 0.9)',
    color: 'var(--grey-400)',
    fontSize: '10px',
    lineHeight: '14px',
  },
  '& .maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib.maplibregl-compact-show':
    { padding: '0 10px 0 22px' },
  '& .maplibregl-ctrl-attrib a': { color: 'var(--grey-400)' },
  '& .maplibregl-ctrl-attrib-button': {
    top: 0,
    left: 0,
    right: 'auto',
    width: '22px',
    height: '22px',
    borderRadius: 'var(--radius-max)',
    backgroundImage: 'none',
    backgroundColor: 'transparent',
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      backgroundColor: 'var(--accent-main)',
      mask: `${INFO_ICON} center / 14px no-repeat`,
    },
    '&:hover': { backgroundColor: 'var(--accent-150)' },
  },
  '& .maplibregl-compact-show .maplibregl-ctrl-attrib-button': {
    backgroundColor: 'transparent',
  },
};

const LAYOUT_GAP = 32;

// the scroll area reaches 12px past the cards so their shadows aren't clipped
const PANEL_STACK = {
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  overflowY: 'auto',
  pointerEvents: 'none',
  '& > *': { pointerEvents: 'auto', boxShadow: 'var(--hover-shadow)' },
} as const;

const SWITCH_SHELL = {
  borderRadius: 'var(--radius-l)',
  boxShadow: 'var(--hover-shadow)',
};

const TerritoriesMap = ({ map }: { map: TerritoriesMapState }) => {
  const navigate = useNavigate();

  const { laptopUp } = useBreakpoints();

  // on a phone the panel would cover the map, so it starts closed there
  const [panelOpen, setPanelOpen] = useState(laptopUp);

  const [top, setTop] = useState(130);

  useLayoutEffect(() => {
    const element = map.wrapper.current;
    if (!element) return;

    // offsets ignore the page's slide-in transform, which a bounding box would measure mid-animation
    const measure = () => {
      let offset = 0;
      let node: HTMLElement | null = element;

      while (node) {
        offset += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }

      setTop(offset);
    };

    measure();
    window.addEventListener('resize', measure);

    return () => window.removeEventListener('resize', measure);
  }, [map.wrapper]);

  const { editor } = map;

  // the editing steps are the only guide while drawing, so they cannot be hidden
  const compact = !laptopUp;

  // on a phone the editing steps sit behind the panel button, so the drawing stays visible
  const showPanel = panelOpen || (editor.editing && !compact);

  // on a wide screen the switch keeps the top left and the panel slides out
  // from under it, so nothing jumps when it opens or closes
  const inset = compact ? '12px' : `${PANEL_WIDTH + 24}px`;

  const modeSwitch = (
    <TabSwitcher
      ariaLabel={tx('Map mode')}
      surface="light"
      iconOnly={compact}
      value={map.mode}
      onChange={map.setMode}
      options={[
        { value: 'view', label: tx('View'), icon: <IconVisibility /> },
        { value: 'edit', label: tx('Edit'), icon: <IconEdit /> },
      ]}
      // as tall as the map's button islands
      sx={{
        width: compact ? '88px' : '100%',
        '& button': { minHeight: '36px' },
      }}
    />
  );

  const panelButton = (
    <MapIsland corner="static">
      <MapAction
        title={showPanel ? tx('Hide the panel') : tx('Show the panel')}
        // the panel slides under the pointer, so the tip waits
        delaySpeed="slow"
        onClick={() => setPanelOpen(!showPanel)}
      >
        {showPanel ? (
          <IconPanelClose color="var(--accent-main)" />
        ) : (
          <IconPanelOpen color="var(--accent-main)" />
        )}
      </MapAction>
    </MapIsland>
  );

  const panelContents = (
    <>
      {editor.editing && (
        <EditPanel editor={editor} territory={map.selected} onSave={map.save} />
      )}

      {!editor.editing && (
        <>
          <MapFilters
            search={map.search}
            onSearch={map.setSearch}
            colorView={map.colorView}
            onColorViewChange={map.setColorView}
            heatmapPeriod={map.heatmapPeriod}
            onHeatmapPeriodChange={map.setHeatmapPeriod}
            onCollapse={() => setPanelOpen(false)}
          />

          <Box sx={{ flex: '1 0 200px', minHeight: '200px' }}>
            <TerritoryPicker
              territories={map.territories}
              selectedId={map.selectedId}
              onSelect={(id) => {
                map.pickTerritory(id);
                if (!laptopUp) setPanelOpen(false);
              }}
              height="100%"
            />
          </Box>
        </>
      )}
    </>
  );

  return (
    <Box
      sx={{
        height: map.fullscreen ? '100%' : 'auto',
        // takes back the 32px the page layout keeps under every page
        marginBottom: map.fullscreen ? 0 : `${BOTTOM_GAP - LAYOUT_GAP}px`,
        ...(map.fullscreen && {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1300,
          paddingTop: `calc(12px + ${systemBarInset('top')})`,
          paddingRight: `calc(12px + ${systemBarInset('right')})`,
          paddingBottom: `calc(12px + ${systemBarInset('bottom')})`,
          paddingLeft: `calc(12px + ${systemBarInset('left')})`,
          backgroundColor: 'var(--white)',
        }),
      }}
    >
      <Box
        ref={map.wrapper}
        sx={{
          position: 'relative',
          height: map.fullscreen
            ? '100%'
            : `max(560px, calc(100dvh - ${top + BOTTOM_GAP}px - ${systemBarInset('top')} - ${systemBarInset('bottom')}))`,
          backgroundColor: 'var(--white)',
          borderRadius: 'var(--radius-l)',
          border: '1px solid var(--accent-200)',
          overflow: 'hidden',
          // a WebGL canvas ignores overflow clipping in Safari; clip-path doesn't
          clipPath: 'inset(0 round var(--radius-l))',
          '& .maplibregl-map': { height: '100%', width: '100%' },
          ...ATTRIBUTION_STYLES,
        }}
      >
        <Box ref={map.container} sx={{ height: '100%', width: '100%' }} />

        {compact && showPanel && (
          <Box
            sx={{
              position: 'absolute',
              // on a phone it opens under the top row, which stays usable
              top: '58px',
              left: 0,
              bottom: 0,
              width: '100%',
              zIndex: 3,
              ...PANEL_STACK,
            }}
          >
            {panelContents}
          </Box>
        )}

        {!compact && (
          <Stack
            spacing="8px"
            sx={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              // leaves the corner below free for the attribution button
              bottom: '44px',
              width: `${PANEL_WIDTH}px`,
              zIndex: 3,
              pointerEvents: 'none',
              '& > *': { pointerEvents: 'auto' },
            }}
          >
            <Box sx={SWITCH_SHELL}>{modeSwitch}</Box>

            <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
              <Box
                sx={{
                  position: 'absolute',
                  inset: '-12px',
                  ...PANEL_STACK,
                  transform: showPanel
                    ? 'none'
                    : `translateX(calc(-100% - 24px))`,
                  opacity: showPanel ? 1 : 0,
                  visibility: showPanel ? 'visible' : 'hidden',
                  transition: `transform ${SLIDE}, opacity ${SLIDE}, visibility 0s ${showPanel ? '0s' : '340ms'}`,
                  '@media (prefers-reduced-motion: reduce)': {
                    transition: 'none',
                  },
                }}
              >
                {panelContents}
              </Box>

              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  opacity: showPanel ? 0 : 1,
                  transform: showPanel ? 'scale(0.9)' : 'none',
                  visibility: showPanel ? 'hidden' : 'visible',
                  // appears once the panel has slid away
                  transition: showPanel
                    ? 'opacity 120ms, transform 120ms, visibility 0s 120ms'
                    : `opacity 200ms 180ms, transform 200ms 180ms`,
                  '@media (prefers-reduced-motion: reduce)': {
                    transition: 'none',
                  },
                }}
              >
                {panelButton}
              </Box>
            </Box>
          </Stack>
        )}

        <Stack
          direction="row"
          sx={{
            position: 'absolute',
            top: '12px',
            left: inset,
            right: '12px',
            zIndex: 2,
            gap: compact ? '6px' : '8px',
            alignItems: 'flex-start',
            pointerEvents: 'none',
            '& > *': { pointerEvents: 'auto' },
          }}
        >
          {compact && panelButton}

          {editor.editing && <EditToolbar editor={editor} compact={compact} />}

          {!editor.editing && map.mode === 'edit' && (
            <IdleToolbar
              compact={compact}
              onCongregation={() => map.startEditing('congregation')}
            />
          )}

          {map.mode === 'view' && map.selected && (
            <ViewToolbar
              compact={compact}
              selected={map.selected}
              onDetails={() =>
                map.selected &&
                navigate(`/territories/${map.selected.id}`, {
                  state: { parent: tx('Territory coverage map') },
                })
              }
            />
          )}

          {compact && (
            <Box sx={{ marginLeft: 'auto', flexShrink: 0, ...SWITCH_SHELL }}>
              {modeSwitch}
            </Box>
          )}
        </Stack>

        <Box
          sx={{
            position: 'absolute',
            right: '12px',
            bottom: '12px',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '8px',
          }}
        >
          <MapIsland corner="static" vertical>
            <MapAction
              title={tx('Zoom in')}
              placement="left"
              onClick={map.zoomIn}
            >
              <IconAdd color="var(--accent-main)" />
            </MapAction>

            <CustomDivider color="var(--accent-200)" sx={{ width: '24px' }} />

            <MapAction
              title={tx('Zoom out')}
              placement="left"
              onClick={map.zoomOut}
            >
              <IconRemove color="var(--accent-main)" />
            </MapAction>
          </MapIsland>

          <MapIsland corner="static">
            <NorthAction map={map.instance} placement="top" />

            <MapAction
              title={tx('My location')}
              placement="top"
              onClick={map.locate}
            >
              <IconMyLocation color="var(--accent-main)" />
            </MapAction>

            <MapAction
              title={tx('Show all territories')}
              placement="top"
              onClick={map.fitAll}
            >
              <IconMapOverview color="var(--accent-main)" />
            </MapAction>

            <MapAction
              title={
                map.fullscreen ? tx('Exit full screen') : tx('Full screen')
              }
              placement="top"
              onClick={map.toggleFullscreen}
            >
              {map.fullscreen ? (
                <IconFullscreenExit color="var(--accent-main)" />
              ) : (
                <IconFullscreen color="var(--accent-main)" />
              )}
            </MapAction>
          </MapIsland>
        </Box>
      </Box>

      <Dialog
        open={map.pendingLeave}
        onClose={map.keepEditing}
        title={tx('Discard changes')}
        description={tx('Your unsaved changes will be lost.')}
      >
        <DialogActions>
          <Button variant="secondary" onClick={map.keepEditing}>
            {tx('Keep editing')}
          </Button>
          <Button variant="main" color="red" onClick={map.confirmLeave}>
            {tx('Discard')}
          </Button>
        </DialogActions>
      </Dialog>

      {editor.labelling !== undefined && (
        <LabelDialog
          onSave={editor.saveLabel}
          onClose={() => editor.saveLabel('')}
        />
      )}
    </Box>
  );
};

export default TerritoriesMap;
