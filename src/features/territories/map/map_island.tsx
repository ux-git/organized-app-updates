import { ReactNode, useEffect, useState } from 'react';
import { Box, Stack, TooltipProps } from '@mui/material';
import * as maplibregl from 'maplibre-gl';
import IconButton from '@components/icon_button';
import Tooltip from '@components/tooltip';
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
      aria-label={title}
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

// always there, like a compass: the needle points north as the map turns
export const NorthAction = ({
  map,
  placement,
}: {
  map?: maplibregl.Map | null;
  placement?: TooltipProps['placement'];
}) => {
  const [bearing, setBearing] = useState(0);

  useEffect(() => {
    if (!map) return;

    const update = () => setBearing(map.getBearing());

    update();
    map.on('rotate', update);

    return () => {
      map.off('rotate', update);
    };
  }, [map]);

  return (
    <MapAction
      title={tx('Turn to north')}
      placement={placement}
      onClick={() => map?.easeTo({ bearing: 0, pitch: 0 })}
    >
      {/* the red half points north */}
      <Box
        component="svg"
        viewBox="0 0 24 24"
        sx={{ width: 24, height: 24, transform: `rotate(${-bearing}deg)` }}
      >
        <path d="M12 3.2 15.2 12H8.8Z" fill="var(--red-main)" />
        <path d="M12 20.8 8.8 12h6.4Z" fill="var(--accent-main)" />
      </Box>
    </MapAction>
  );
};

export default MapIsland;
