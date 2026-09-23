import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box, MenuItem, Select } from '@mui/material';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Button from '@components/button';
import Dialog from '@components/dialog';
import Typography from '@components/typography';
import { isDarkThemeState } from '@states/app';
import {
  DEFAULT_CENTER,
  DEFAULT_PROVIDER,
  styleUrl,
} from '@features/territories/map/constants';
import { nearby } from '../native';

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
    const created = new maplibregl.Map({
      container: element,
      style: styleUrl(DEFAULT_PROVIDER, isDark),
      center: hall ? [hall.lng, hall.lat] : [...DEFAULT_CENTER],
      zoom: hall ? 16 : 13,
      attributionControl: { compact: true },
    });
    created.on('load', () => {
      created.addSource(AREA, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      created.addLayer({
        id: AREA,
        type: 'fill',
        source: AREA,
        paint: { 'fill-color': '#5065D0', 'fill-opacity': 0.2 },
      });
      created.addLayer({
        id: `${AREA}-line`,
        type: 'line',
        source: AREA,
        paint: { 'line-color': '#5065D0', 'line-width': 2 },
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
      marker.current = new maplibregl.Marker({ color: '#5065D0' })
        .setLngLat(point)
        .addTo(current);
    } else {
      marker.current.setLngLat(point);
    }
  }, [point, radius, ready]);

  const save = () => {
    if (!point) return;
    nearby('hallSet', { lng: point[0], lat: point[1], radius });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Kingdom Hall on the map"
      description="Tap the Kingdom Hall. Arriving inside the circle starts a search for paired phones."
    >
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Typography className="body-small-regular" sx={{ flex: 1 }}>
          Arrival area
        </Typography>
        <Select
          size="small"
          value={radius}
          onChange={(event) => setRadius(Number(event.target.value))}
        >
          {RADII.map((meters) => (
            <MenuItem key={meters} value={meters}>
              {meters} m around it
            </MenuItem>
          ))}
        </Select>
      </Box>
      <Button
        variant="tertiary"
        onClick={() =>
          navigator.geolocation.getCurrentPosition(
            ({ coords }) =>
              map.current?.flyTo({
                center: [coords.longitude, coords.latitude],
                zoom: 16,
              }),
            () => {},
            { enableHighAccuracy: true, timeout: 10_000 }
          )
        }
      >
        Show where I am
      </Button>
      <Box sx={{ display: 'flex', gap: '8px' }}>
        {hall && (
          <Button
            variant="secondary"
            onClick={() => {
              nearby('hallClear');
              onClose();
            }}
          >
            Remove
          </Button>
        )}
        <Button variant="main" disabled={!point} onClick={save}>
          Save
        </Button>
      </Box>
      <Button variant="tertiary" onClick={onClose}>
        Cancel
      </Button>
    </Dialog>
  );
};

export default HallPicker;
