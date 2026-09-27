import { ReactNode, useEffect, useState } from 'react';
import { Stack, TooltipProps } from '@mui/material';
import * as maplibregl from 'maplibre-gl';
import IconButton from '@components/icon_button';
import Tooltip from '@components/tooltip';
import { IconCompassOn } from '@icons/index';
import { tx } from '@services/i18n/translation';

type Corner =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'left'
  | 'static';

const PLACE: Record<Corner, object> = {
  'top-left': { top: '12px', left: '12px' },
  'top-right': { top: '12px', right: '12px' },
  'bottom-left': { bottom: '12px', left: '12px' },
  'bottom-right': { bottom: '12px', right: '12px' },
  left: { top: '50%', left: '12px', transform: 'translateY(-50%)' },
  static: { position: 'relative' },
};

const MapIsland = ({
  corner,
  vertical = false,
  children,
}: {
  corner: Corner;
  vertical?: boolean;
  children: ReactNode;
}) => (
  <Stack
    direction={vertical ? 'column' : 'row'}
    sx={{
      position: 'absolute',
      zIndex: 2,
      alignItems: 'center',
      gap: '4px',
      padding: '4px',
      borderRadius: 'var(--radius-l)',
      backgroundColor: 'var(--white)',
      border: '1px solid var(--accent-200)',
      boxShadow: 'var(--hover-shadow)',
      ...PLACE[corner],
    }}
  >
    {children}
  </Stack>
);

export const MapAction = ({
  title,
  placement,
  delaySpeed,
  onClick,
  children,
}: {
  title: string;
  placement?: TooltipProps['placement'];
  delaySpeed?: 'fast' | 'slow';
  onClick: VoidFunction;
  children: ReactNode;
}) => (
  <Tooltip title={title} placement={placement} delaySpeed={delaySpeed}>
    <IconButton
      onClick={onClick}
      sx={{
        padding: '6px',
        margin: 0,
        borderRadius: 'var(--radius-m)',
        backgroundColor: 'transparent',
        '&:hover': { backgroundColor: 'var(--accent-150)' },
      }}
    >
      {children}
    </IconButton>
  </Tooltip>
);

// only there while the map is turned or tilted; the needle follows north
export const NorthAction = ({
  map,
  placement,
}: {
  map?: maplibregl.Map | null;
  placement?: TooltipProps['placement'];
}) => {
  const [view, setView] = useState({ bearing: 0, pitch: 0 });

  useEffect(() => {
    if (!map) return;

    const update = () =>
      setView({ bearing: map.getBearing(), pitch: map.getPitch() });

    update();
    map.on('rotate', update);
    map.on('pitch', update);

    return () => {
      map.off('rotate', update);
      map.off('pitch', update);
    };
  }, [map]);

  if (!map || (Math.abs(view.bearing) < 0.5 && view.pitch < 0.5)) return null;

  return (
    <MapAction
      title={tx('Turn to north')}
      placement={placement}
      onClick={() => map.easeTo({ bearing: 0, pitch: 0 })}
    >
      <IconCompassOn
        color="var(--accent-main)"
        sx={{ transform: `rotate(${-view.bearing}deg)` }}
      />
    </MapAction>
  );
};

export default MapIsland;
