import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { JWLangLocaleState } from '@states/settings';
import * as maplibregl from 'maplibre-gl';
import { Image, Page, pdf, Text, View } from '@react-pdf/renderer';
import { Stack, SvgIcon } from '@mui/material';
import { Button, Checkbox, Typography } from '@components/index';
import Dialog from '@components/dialog';
import TabSwitcher from '@components/tab_switcher';
import DialogActions from '@components/dialog_actions';
import { Document } from '@views/components';
import { mapRequest } from '@services/maps/offline';
import { mapPerformanceOptions } from '@services/maps/performance';
import { exportFile } from '@services/files/export';
import { displaySnackNotification } from '@services/states/app';
import { tx } from '@services/i18n/translation';
import { formatDate } from '@utils/date';
import { MapColor, Territory, TerritoryBoundary } from '@definition/territory';
import {
  DEFAULT_PROVIDER,
  MAP_COLORS,
  MAP_PROVIDER,
  MAP_PROVIDERS,
} from './constants';
import { applyBasemapOptions, DEFAULT_BASEMAP } from './basemap';
import { boundaryBounds } from './helpers';

// ---- the whole congregation's map on paper, from A4 up to a wall poster ----

export type Paper = 'a4' | 'a3' | 'a2' | 'square';

// in millimetres; the dots per inch keep the largest picture under ~9 million
// pixels, which every phone's graphics can hold (a metre square is seen from
// further away, so fewer dots still print sharp)
// lines and numbers grow with the sheet, as a big one is looked at from
// further away
const PAPERS: Record<
  Paper,
  { width: number; height: number; dpi: number; line: number }
> = {
  a4: { width: 210, height: 297, dpi: 300, line: 1 },
  a3: { width: 297, height: 420, dpi: 200, line: 1.25 },
  a2: { width: 420, height: 594, dpi: 150, line: 1.6 },
  square: { width: 1000, height: 1000, dpi: 75, line: 2.5 },
};

const TERRITORY_LINE = 1.4;
// the congregation's outline at least twice as thick as a territory's
const BORDER_LINE = TERRITORY_LINE * 2.5;

const PAPER_LABEL: Record<Paper, string> = {
  a4: 'A4',
  a3: 'A3',
  a2: 'A2',
  square: 'Square',
};

// the size a print shop needs, in the file name only
const FILE_SIZE: Record<Paper, string> = {
  ...PAPER_LABEL,
  square: '100x100cm',
};

// the map is laid out at this scale, so street names stay a readable size on
// paper and a larger sheet shows more of the streets, not bigger letters
const PX_PER_MM = 4;
// printed at home: the map runs to the edge, the caption sits on it
const CAPTION_INSET_MM = 6;
const POINTS_PER_MM = 72 / 25.4;

export type OverviewOptions = {
  paper: Paper;
  landscape: boolean;
  border: boolean;
  territories: boolean;
  numbers: boolean;
  colors: boolean;
};

const sizeOf = ({ paper, landscape }: OverviewOptions) => {
  const { width, height, ...rest } = PAPERS[paper];
  return landscape
    ? { width: height, height: width, ...rest }
    : { width, height, ...rest };
};

const middle = (ring: TerritoryBoundary): [number, number] => {
  const [west, south, east, north] = boundaryBounds(ring);
  return [(west + east) / 2, (south + north) / 2];
};

/** Renders the overview off screen as a JPEG data URL; partial when some of
 * the map didn't load. */
const captureOverview = (
  territories: Territory[],
  areas: GeoJSON.FeatureCollection<GeoJSON.Polygon>,
  congregation: TerritoryBoundary | undefined,
  borderColor: MapColor,
  borderDashed: boolean,
  options: OverviewOptions
) =>
  new Promise<{ image: string; partial: boolean } | undefined>((resolve) => {
    const drawn = territories.filter((item) => item.boundary?.length);
    const border = options.border ? congregation : undefined;
    const extent = border?.length ? border : drawn.flatMap((t) => t.boundary!);
    if (!extent.length) return resolve(undefined);

    const paper = sizeOf(options);
    const width = Math.round(paper.width * PX_PER_MM);
    const height = Math.round(paper.height * PX_PER_MM);

    const container = document.createElement('div');
    container.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px`;
    document.body.appendChild(container);

    // room around the area, so nothing sits where a printer can't reach
    const margin = Math.round(Math.min(width, height) * 0.05);
    let map: maplibregl.Map;
    try {
      const tuned = mapPerformanceOptions();
      map = new maplibregl.Map({
        container,
        // paper is white, whatever the app's theme
        style: MAP_PROVIDER.light,
        bounds: boundaryBounds(extent),
        fitBoundsOptions: { padding: margin },
        interactive: false,
        transformRequest: mapRequest,
        attributionControl: false,
        ...tuned,
        pixelRatio: paper.dpi / (PX_PER_MM * 25.4),
        maxTileCacheSize: Math.min(64, tuned.maxTileCacheSize),
        canvasContextAttributes: {
          ...tuned.canvasContextAttributes,
          preserveDrawingBuffer: true,
          antialias: true,
        },
      });
    } catch {
      container.remove();
      return resolve(undefined);
    }

    let done = false;
    let styled = false;
    let partial = false;
    const finish = (capture = true) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      const image = capture
        ? map.getCanvas().toDataURL('image/jpeg', 0.92)
        : undefined;
      map.remove();
      container.remove();
      resolve(image ? { image, partial } : undefined);
    };
    // a big sheet loads many tiles; what has come by then still prints
    const timeout = window.setTimeout(() => {
      partial = true;
      finish(styled);
    }, 60000);

    map.on('style.load', () => {
      styled = true;
      applyBasemapOptions(map, DEFAULT_PROVIDER, DEFAULT_BASEMAP);

      for (const layer of map.getStyle().layers) {
        if (layer.type !== 'symbol') continue;
        // road numbers like B57 only crowd a territory map
        if (/shield/.test(layer.id)) {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
          continue;
        }
        if (layer.layout?.['text-field'] === undefined) continue;
        map.setPaintProperty(layer.id, 'text-color', '#555555');
        map.setPaintProperty(layer.id, 'text-halo-color', '#FFFFFF');
      }

      if (options.territories) {
        map.addSource('print-territories', { type: 'geojson', data: areas });
        if (options.colors) {
          map.addLayer({
            id: 'print-fill',
            type: 'fill',
            source: 'print-territories',
            filter: ['to-boolean', ['get', 'filled']],
            paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': 0.18 },
          });
        }
        map.addLayer({
          id: 'print-territories',
          type: 'line',
          source: 'print-territories',
          layout: { 'line-join': 'round' },
          paint: {
            'line-color': options.colors ? ['get', 'color'] : '#2E3E8F',
            'line-width': TERRITORY_LINE * paper.line,
          },
        });
      }

      if (border?.length) {
        map.addSource('print-border', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [border] },
          },
        });
        map.addLayer({
          id: 'print-border',
          type: 'line',
          source: 'print-border',
          paint: {
            'line-color': MAP_COLORS[borderColor],
            'line-width': BORDER_LINE * paper.line,
            ...(borderDashed && { 'line-dasharray': [4, 3] }),
          },
        });
      }

      if (options.territories && options.numbers) {
        map.addSource('print-numbers', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: drawn.map((item) => ({
              type: 'Feature',
              properties: { number: String(item.number ?? '') },
              geometry: { type: 'Point', coordinates: middle(item.boundary!) },
            })),
          },
        });
        map.addLayer({
          id: 'print-numbers',
          type: 'symbol',
          source: 'print-numbers',
          layout: {
            'text-field': ['get', 'number'],
            'text-font': [...MAP_PROVIDERS[DEFAULT_PROVIDER].fonts.number],
            'text-size': 12 * paper.line,
            // every territory gets its number, even where streets are dense
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': '#1F2A66',
            'text-halo-color': '#FFFFFF',
            'text-halo-width': 2 * paper.line,
          },
        });
      }
    });

    map.once('idle', () => finish());
    map.on('error', (event) => {
      if (!styled) return finish(false);
      // offline, a missing tile leaves a gap rather than no map at all
      if ('tile' in event || 'sourceId' in event) partial = true;
    });
  });

// as tall as the map's mode switch
const SWITCH = { '& button': { minHeight: '36px' } };

const IconSheet = ({
  landscape = false,
  width = 24,
  height = 24,
}: {
  landscape?: boolean;
  width?: number;
  height?: number;
}) => (
  <SvgIcon sx={{ width, height }} viewBox="0 0 24 24">
    <g transform={landscape ? 'rotate(90 12 12)' : undefined}>
      <path
        fillRule="evenodd"
        d="M7.8 3.5h8.4c1 0 1.8.8 1.8 1.8v13.4c0 1-.8 1.8-1.8 1.8H7.8c-1 0-1.8-.8-1.8-1.8V5.3c0-1 .8-1.8 1.8-1.8Zm0 1.5c-.2 0-.3.1-.3.3v13.4c0 .2.1.3.3.3h8.4c.2 0 .3-.1.3-.3V5.3c0-.2-.1-.3-.3-.3H7.8Z"
      />
    </g>
  </SvgIcon>
);

const OverviewDocument = ({
  image,
  options,
  caption,
  lang,
}: {
  image: string;
  options: OverviewOptions;
  caption: string;
  lang: string;
}) => {
  const paper = sizeOf(options);
  const inset = CAPTION_INSET_MM * POINTS_PER_MM;
  return (
    <Document title={tx('Territory overview')} lang={lang}>
      <Page
        size={[paper.width * POINTS_PER_MM, paper.height * POINTS_PER_MM]}
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <Image src={image} style={{ width: '100%', height: '100%' }} />
        <View
          style={{
            position: 'absolute',
            left: inset,
            bottom: inset,
            paddingVertical: 2,
            paddingHorizontal: 4,
            borderRadius: 2,
            backgroundColor: '#FFFFFF',
          }}
        >
          <Text style={{ fontSize: 8, color: '#757575' }}>{caption}</Text>
        </View>
      </Page>
    </Document>
  );
};

/** Choose the sheet and what goes on it, then save the map as a PDF. */
export const PrintOverviewDialog = ({
  open,
  onClose,
  territories,
  areas,
  congregation,
  borderColor,
  borderDashed,
}: {
  open: boolean;
  onClose: VoidFunction;
  territories: Territory[];
  areas: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  congregation: TerritoryBoundary | undefined;
  borderColor: MapColor;
  borderDashed: boolean;
}) => {
  const [options, setOptions] = useState<OverviewOptions>({
    paper: 'a3',
    landscape: true,
    border: true,
    territories: true,
    numbers: true,
    colors: true,
  });
  const [busy, setBusy] = useState(false);
  const locale = useAtomValue(JWLangLocaleState);
  const set = (next: Partial<OverviewOptions>) =>
    setOptions((current) => ({ ...current, ...next }));
  const hasBorder = !!congregation?.length;
  const empty =
    !hasBorder && !territories.some((item) => item.boundary?.length);

  const save = async () => {
    setBusy(true);
    try {
      const result = await captureOverview(
        territories,
        areas,
        congregation,
        borderColor,
        borderDashed,
        {
          ...options,
          border: options.border && hasBorder,
        }
      );
      if (!result) throw new Error(tx('The map could not be drawn.'));
      const caption = tx('Territory overview · printed {{date}}', {
        date: formatDate(new Date(), 'dd.MM.yyyy'),
      });
      const blob = await pdf(
        <OverviewDocument
          image={result.image}
          options={options}
          caption={caption}
          lang={locale}
        />
      ).toBlob();
      const size = FILE_SIZE[options.paper];
      const turn =
        options.paper === 'square'
          ? ''
          : `-${tx(options.landscape ? 'landscape' : 'portrait')}`;
      const saved = await exportFile(
        blob,
        `${tx('Territory-overview')}-${size}${turn}.pdf`
      );
      if (saved && result.partial) {
        displaySnackNotification({
          header: tx('Parts of the map are missing'),
          message: tx(
            'Some map tiles could not be loaded. Print again once you are online.'
          ),
          severity: 'error',
        });
      }
      onClose();
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        displaySnackNotification({
          header: tx('Export failed'),
          message: (error as Error).message,
          severity: 'error',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={tx('Print map')}>
      <Stack spacing="16px" sx={{ width: '100%' }}>
        <Stack spacing="8px">
          <Typography className="label-small-medium" color="var(--grey-400)">
            {tx('Paper size')}
          </Typography>
          <TabSwitcher
            ariaLabel={tx('Paper size')}
            surface="light"
            value={options.paper}
            onChange={(paper: Paper) => set({ paper })}
            options={(Object.keys(PAPERS) as Paper[]).map((paper) => ({
              value: paper,
              label: tx(PAPER_LABEL[paper]),
            }))}
            sx={SWITCH}
          />
        </Stack>
        {/* a square has no sides to turn */}
        {options.paper !== 'square' && (
          <Stack spacing="8px">
            <Typography className="label-small-medium" color="var(--grey-400)">
              {tx('Orientation')}
            </Typography>
            <TabSwitcher
              ariaLabel={tx('Orientation')}
              surface="light"
              collapseBelow={180}
              value={options.landscape ? 'landscape' : 'portrait'}
              onChange={(turn: 'portrait' | 'landscape') =>
                set({ landscape: turn === 'landscape' })
              }
              options={[
                {
                  value: 'portrait',
                  label: tx('Portrait'),
                  icon: <IconSheet />,
                },
                {
                  value: 'landscape',
                  label: tx('Landscape'),
                  icon: <IconSheet landscape />,
                },
              ]}
              sx={SWITCH}
            />
          </Stack>
        )}
        <Stack spacing="4px">
          <Checkbox
            label={tx('Congregation border')}
            checked={options.border && hasBorder}
            disabled={!hasBorder}
            onChange={(event) => set({ border: event.target.checked })}
          />
          <Checkbox
            label={tx('All territories')}
            checked={options.territories}
            onChange={(event) => set({ territories: event.target.checked })}
          />
          <Checkbox
            label={tx('Territory numbers')}
            checked={options.territories && options.numbers}
            disabled={!options.territories}
            onChange={(event) => set({ numbers: event.target.checked })}
          />
          <Checkbox
            label={tx('Colours, as on the map')}
            checked={options.territories && options.colors}
            disabled={!options.territories}
            onChange={(event) => set({ colors: event.target.checked })}
          />
        </Stack>
        {empty && (
          <Typography className="body-small-regular" color="var(--grey-400)">
            {tx('Draw the congregation border or a territory first.')}
          </Typography>
        )}
      </Stack>
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button variant="main" disabled={busy || empty} onClick={save}>
          {busy ? tx('Preparing…') : tx('Export PDF')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
