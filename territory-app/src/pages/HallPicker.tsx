import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box } from '@mui/material';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Button from '@components/button';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import MenuItem from '@components/menuitem';
import Select from '@components/select';
import Typography from '@components/typography';
import { IconMyLocation } from '@icons/index';
import { isDarkThemeState } from '@states/app';
import { getCSSPropertyValue } from '@utils/common';
import {
  congregationBoundaryState,
  territoriesState,
} from '@states/territories';
import {
  DEFAULT_CENTER,
  DEFAULT_PROVIDER,
  styleUrl,
} from '@features/territories/map/constants';
import MapIsland, { MapAction } from '@features/territories/map/map_island';
import { congregationBounds } from '@features/territories/map/helpers';
import { chosen } from '../haptics';
import { nearby } from '../native';
import { t } from '../i18n';

type Hall = { lat: number; lng: number; radius: number };

const RADII = [100, 150, 250, 400];
const AREA = 'hall-area';

// the arrival area as a polygon, which the map draws true to scale
const circle = ([lng, lat]: [number, number], meters: number) => {
  const points: [number, number][] = [];
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * 2 * Math.PI;
    points.push([lng + dLng * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }
  return {
    type: 'Feature' as const,
    geometry: { type: 'Polygon' as const, coordinates: [points] },
    properties: {},
  };
};

/** Choosing the Kingdom Hall by tapping the map, instead of standing in it. */
const HallPicker = ({
  open,
  hall,
  onClose,
}: {
  open: boolean;
  hall: Hall | null | undefined;
  onClose: VoidFunction;
}) => {
  const isDark = useAtomValue(isDarkThemeState);
  const territories = useAtomValue(territoriesState);
  const congregationBoundary = useAtomValue(congregationBoundaryState);
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const [point, setPoint] = useState<[number, number] | null>(
    hall ? [hall.lng, hall.lat] : null
  );
  const [radius, setRadius] = useState(hall?.radius ?? 150);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPoint(hall ? [hall.lng, hall.lat] : null);
    setRadius(hall?.radius ?? 150);
  }, [open, hall]);

  // the dialog mounts its content after opening, so the map waits for it
  const attach = (element: HTMLDivElement | null) => {
    container.current = element;
    if (!element || map.current) return;
    // without a hall yet, the congregation's area is where to look
    const area = hall
      ? undefined
      : congregationBounds(territories, congregationBoundary);
    const created = new maplibregl.Map({
      container: element,
      style: styleUrl(DEFAULT_PROVIDER, isDark),
      ...(area
        ? { bounds: area, fitBoundsOptions: { padding: 24 } }
        : {
            center: hall ? [hall.lng, hall.lat] : [...DEFAULT_CENTER],
            zoom: hall ? 16 : 13,
          }),
      attributionControl: { compact: true },
    });
    created.on('load', () => {
      const accent = getCSSPropertyValue('--accent-main');
      created.addSource(AREA, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      created.addLayer({
        id: AREA,
        type: 'fill',
        source: AREA,
        paint: { 'fill-color': accent, 'fill-opacity': 0.2 },
      });
      created.addLayer({
        id: `${AREA}-line`,
        type: 'line',
        source: AREA,
        paint: { 'line-color': accent, 'line-width': 2 },
      });
      setReady(true);
    });
    created.on('click', (event) =>
      setPoint([event.lngLat.lng, event.lngLat.lat])
    );
    // the dialog grows into place, so the map follows its size
    const observer = new ResizeObserver(() => created.resize());
    observer.observe(element);
    created.once('remove', () => observer.disconnect());
    map.current = created;
  };

  useEffect(() => {
    if (open) return;
    marker.current?.remove();
    marker.current = null;
    map.current?.remove();
    map.current = null;
    setReady(false);
  }, [open]);

  useEffect(() => {
    const current = map.current;
    if (!current || !ready) return;
    const source = current.getSource(AREA) as
      | maplibregl.GeoJSONSource
      | undefined;
    source?.setData({
      type: 'FeatureCollection',
      features: point ? [circle(point, radius)] : [],
    });
    if (!point) return;
    if (!marker.current) {
      marker.current = new maplibregl.Marker({
        color: getCSSPropertyValue('--accent-main'),
      })
        .setLngLat(point)
        .addTo(current);
    } else {
      marker.current.setLngLat(point);
    }
  }, [point, radius, ready]);

  const locate = () =>
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        map.current?.flyTo({
          center: [coords.longitude, coords.latitude],
          zoom: 16,
        }),
      () => {},
      { enableHighAccuracy: true, timeout: 10_000 }
    );

  const save = () => {
    if (!point) return;
    nearby('hallSet', { lng: point[0], lat: point[1], radius });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('hall.mapTitle')}
      description={t('hall.mapText')}
    >
      <Box sx={{ position: 'relative', width: '100%' }}>
        <Box
          ref={attach}
          sx={{
            width: '100%',
            height: '50vh',
            minHeight: 280,
            borderRadius: 'var(--radius-l)',
            overflow: 'hidden',
            border: '1px solid var(--accent-300)',
          }}
        />
        {/* the coverage map's own button, in the same corner */}
        <Box sx={{ position: 'absolute', right: '12px', bottom: '12px' }}>
          <MapIsland corner="static">
            <MapAction
              title={t('hall.whereAmI')}
              placement="top"
              onClick={locate}
            >
              <IconMyLocation color="var(--accent-main)" />
            </MapAction>
          </MapIsland>
        </Box>
      </Box>
      <Select
        label={t('hall.area')}
        value={radius}
        onChange={(event) => setRadius(chosen(Number(event.target.value)))}
      >
        {RADII.map((meters) => (
          <MenuItem key={meters} value={meters}>
            <Typography className="body-regular" color="var(--black)">
              {t('hall.radius', { meters })}
            </Typography>
          </MenuItem>
        ))}
      </Select>
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="main" disabled={!point} onClick={save}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default HallPicker;
