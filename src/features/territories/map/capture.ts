import { paintMapAttribution } from '@services/maps/attribution';
import {
  streetRuns,
  streetLength,
  streetMidpoint,
  contains,
} from '@features/territories/map/street_runs';
import { mapRequest } from '@services/maps/offline';
import { mapPerformanceOptions } from '@services/maps/performance';
import * as maplibregl from 'maplibre-gl';
import { Territory } from '@definition/territory';
import {
  DEFAULT_PROVIDER,
  MAP_COLORS,
  MAP_EXPORT_PADDING,
  MAP_PROVIDER,
} from '@features/territories/map/constants';
import {
  applyBasemapOptions,
  DEFAULT_BASEMAP,
  isBuildingOutline,
  isHouseNumber,
  isStreetName,
} from '@features/territories/map/basemap';
import { boundaryBounds } from '@features/territories/map/helpers';
import {
  addDoNotCallLayer,
  addOutsideVeil,
  addTerritoryLayers,
  setDoNotCallData,
} from '@features/territories/map/layers';
import { paintMarkers } from '@features/territories/map/markers';

// metres from a street's middle to its edge, for an ordinary residential street;
// the border's own half width is added per print, from its zoom
const STREET_HALF = 4;

// the ring moved outward by a distance in metres, corners mitred (at most twice as far)
const widen = (ring: [number, number][], metres: number) => {
  const open =
    ring.length > 1 &&
    ring[0][0] === ring.at(-1)![0] &&
    ring[0][1] === ring.at(-1)![1]
      ? ring.slice(0, -1)
      : ring;
  const kx = 111320 * Math.cos((open[0][1] * Math.PI) / 180);
  const ky = 110540;
  const points = open.map(([lng, lat]) => [lng * kx, lat * ky]);

  const area = points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0);
  // outward is to the right of a counter-clockwise ring, to the left of a clockwise one
  const side = area > 0 ? 1 : -1;

  const normal = (a: number[], b: number[]) => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const length = Math.hypot(dx, dy) || 1;
    return [(side * dy) / length, (-side * dx) / length];
  };

  const moved = points.map((point, i) => {
    const before = points[(i - 1 + points.length) % points.length];
    const after = points[(i + 1) % points.length];
    const [ax, ay] = normal(before, point);
    const [bx, by] = normal(point, after);
    const [mx, my] = [ax + bx, ay + by];
    const length = Math.hypot(mx, my) || 1;
    const cos = (mx * ax + my * ay) / length;
    const reach = Math.min(metres / Math.max(cos, 0.5), metres * 2);
    return [
      (point[0] + (mx / length) * reach) / kx,
      (point[1] + (my / length) * reach) / ky,
    ] as [number, number];
  });

  return [...moved, moved[0]];
};

const closed = (ring: [number, number][]) => {
  const [first, last] = [ring[0], ring.at(-1)!];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
};

// the longer side of the picture; the other follows the frame it is printed in
const SIZE = 1040;

// print resolution; the layout stays at SIZE, only the pixel density grows
const DPI = 300;

const addPrintDoNotCalls = (
  map: maplibregl.Map,
  territory: Territory,
  detail: boolean
) => {
  // on paper the marked houses show at any zoom, to be skipped at the door
  addDoNotCallLayer(map, 0);
  setDoNotCallData(map, [territory]);

  // on paper a ring only needs to hold a house number
  if (detail) {
    map.setPaintProperty('do-not-calls', 'circle-radius', 5.5);
    map.setPaintProperty('do-not-calls', 'circle-stroke-width', 1.5);
  }

  // a small card has no house numbers to ring, so a house is a small solid dot
  if (!detail) {
    map.setPaintProperty('do-not-calls', 'circle-radius', 3.5);
    map.setPaintProperty('do-not-calls', 'circle-opacity', 1);
    map.setPaintProperty('do-not-calls', 'circle-color', MAP_COLORS.red);
    map.setPaintProperty('do-not-calls', 'circle-stroke-color', '#FFFFFF');
    map.setPaintProperty('do-not-calls', 'circle-stroke-width', 1);
  }
};

const showPrintBuildings = (map: maplibregl.Map) => {
  for (const layer of map.getStyle().layers) {
    if (isBuildingOutline(layer)) map.setLayerZoomRange(layer.id, 0, 24);
  }
};

const stylePrintLabels = (map: maplibregl.Map, detail: boolean) => {
  const streets: string[] = [];
  // street names and house numbers stay readable on paper, above the
  // veil, the border and every drawing; paper is light whatever the app theme
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol') continue;

    // road numbers like B57 would sit on the border; the card needs street names only
    if (/shield/.test(layer.id)) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
      continue;
    }

    map.moveLayer(layer.id);
    if (layer.layout?.['text-field'] === undefined) continue;

    map.setPaintProperty(layer.id, 'text-color', '#333333');
    map.setPaintProperty(layer.id, 'text-halo-color', '#FFFFFF');

    if (isStreetName(layer)) streets.push(layer.id, `${layer.id}-inside`);

    // a large card has room for each house and its number, at any zoom
    if (detail && isHouseNumber(layer)) {
      map.setLayerZoomRange(layer.id, 0, 24);
      map.setLayoutProperty(layer.id, 'text-size', 8);
      map.setPaintProperty(layer.id, 'text-color', '#777777');
    }
  }

  if (detail) showPrintBuildings(map);
  return streets;
};

const MAIN_ROADS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];

// outside the border only the main roads keep their names, and streets that
// touch the border; house numbers only inside, so the territory stands out
const quietOutside = (boundary: [number, number][]) =>
  [
    'any',
    ['in', ['get', 'class'], ['literal', MAIN_ROADS]],
    ['in', ['get', 'kind'], ['literal', MAIN_ROADS]],
    [
      '<',
      ['distance', { type: 'LineString', coordinates: closed(boundary) }],
      40,
    ],
  ] as maplibregl.ExpressionSpecification;

// the tiles carry every named street only from this zoom on
const STREET_TILES_FROM = 14;

type StreetFeature = {
  properties: { name?: string };
  geometry: GeoJSON.Geometry;
};

// A wide map loads coarse tiles that leave out the small roads. A hidden map at
// street zoom over the same area reads their lines, never drawn itself.
const fineStreets = (map: maplibregl.Map) =>
  new Promise<StreetFeature[] | undefined>((resolve) => {
    const spec = map.getStyle().layers.find((layer) => isStreetName(layer));
    const scale = 2 ** (STREET_TILES_FROM - map.getZoom());
    if (spec?.type !== 'symbol' || scale <= 1) {
      resolve(undefined);
      return;
    }

    const { clientWidth, clientHeight } = map.getContainer();
    const container = document.createElement('div');
    container.style.cssText = `position:fixed;left:-10000px;top:0;width:${Math.min(clientWidth * scale, 4096)}px;height:${Math.min(clientHeight * scale, 4096)}px`;
    document.body.appendChild(container);

    const fine = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: { streets: map.getStyle().sources[spec.source] },
        layers: [
          {
            id: 'streets',
            type: 'line',
            source: 'streets',
            'source-layer': spec['source-layer'],
            paint: { 'line-opacity': 0 },
          },
        ],
      },
      center: map.getCenter(),
      zoom: STREET_TILES_FROM,
      interactive: false,
      attributionControl: false,
      pixelRatio: 1,
    });

    let finished = false;
    const finish = (features?: StreetFeature[]) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      fine.remove();
      container.remove();
      resolve(features);
    };
    const timeout = window.setTimeout(() => finish(), 8000);
    fine.on('error', () => finish());
    fine.once('idle', () =>
      finish(
        fine
          .querySourceFeatures('streets', { sourceLayer: spec['source-layer'] })
          .map((feature) => ({
            properties: { name: feature.properties.name },
            geometry: feature.geometry,
          }))
      )
    );
  });

const addPrintLabels = (
  map: maplibregl.Map,
  boundary: [number, number][],
  detail: boolean
) => {
  const streets = stylePrintLabels(map, detail);

  const area: maplibregl.ExpressionSpecification = [
    'within',
    { type: 'Polygon', coordinates: [closed(boundary)] },
  ];

  for (const id of streets.filter((name) => !name.endsWith('-inside'))) {
    const spec = map.getStyle().layers.find((layer) => layer.id === id);
    if (spec?.type !== 'symbol') continue;

    const filter = spec.filter ?? true;
    map.setFilter(id, [
      'all',
      filter,
      ['!', area],
      quietOutside(boundary),
    ] as maplibregl.FilterSpecification);
    map.addLayer({
      ...spec,
      id: `${id}-inside`,
      minzoom: 0,
      maxzoom: 24,
      filter: ['all', filter, area] as maplibregl.FilterSpecification,
      layout: { ...spec.layout, 'text-padding': 0, 'symbol-spacing': 90 },
    });
  }

  return streets;
};

// a shared map renders larger than a printed one, so it zooms closer and
// shows more streets; house numbers only from a zoom where they can be read
export type CaptureOptions = {
  size?: number;
  pixelRatio?: number;
  detailFromZoom?: number;
  // street names on a map too far out for house numbers, which leaves them room
  wideStreetSize?: number;
  jpeg?: boolean;
};

/**
 * Renders the territory on an off-screen map and returns it as a PNG data URL.
 * Printing needs a picture, and the same drawing the congregation edits is the
 * only one that is guaranteed to be current.
 */
const capture = (
  territory: Territory,
  ratio: number,
  inset: number,
  printedPoints: number,
  detail: boolean,
  doNotCalls: boolean,
  options: CaptureOptions = {}
) =>
  new Promise<string | undefined>((resolve) => {
    const boundary = territory.boundary;

    if (!boundary?.length) {
      resolve(undefined);
      return;
    }

    const size = options.size ?? SIZE;
    const width = ratio >= 1 ? size : Math.round(size * ratio);
    const height = ratio >= 1 ? Math.round(size / ratio) : size;

    const container = document.createElement('div');
    container.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px`;
    document.body.appendChild(container);

    const [west, south, east, north] = boundaryBounds(boundary);
    // Leave surrounding streets visible between the territory and the map edges.
    const horizontalPadding = Math.round(width * MAP_EXPORT_PADDING);
    const verticalPadding = Math.round(height * MAP_EXPORT_PADDING);

    let map: maplibregl.Map;
    try {
      const tuned = mapPerformanceOptions();

      map = new maplibregl.Map({
        container,
        // the card is printed on white paper, so always the light basemap
        style: MAP_PROVIDER.light,
        bounds: [west, south, east, north],
        fitBoundsOptions: {
          padding: {
            top: verticalPadding,
            right: horizontalPadding,
            left: horizontalPadding,
            // the printed label covers this share of the bottom
            bottom: verticalPadding + Math.round(height * inset),
          },
        },
        interactive: false,
        transformRequest: mapRequest,
        attributionControl: false,
        ...tuned,
        // the picture has a fixed size, whatever the screen
        pixelRatio: options.pixelRatio ?? (printedPoints / 72) * (DPI / SIZE),
        maxTileCacheSize: Math.min(32, tuned.maxTileCacheSize),
        canvasContextAttributes: {
          ...tuned.canvasContextAttributes,
          preserveDrawingBuffer: true,
          antialias: true,
        },
      });
    } catch {
      container.remove();
      resolve(undefined);
      return;
    }

    let done = false;

    const cleanup = (result?: string) => {
      if (done) return;
      done = true;

      window.clearTimeout(timeout);
      try {
        map.remove();
      } finally {
        container.remove();
        resolve(result);
      }
    };

    const timeout = window.setTimeout(() => cleanup(), 12000);

    let styled = false;
    const streets: string[] = [];

    map.on('style.load', () => {
      styled = true;
      applyBasemapOptions(map, DEFAULT_PROVIDER, DEFAULT_BASEMAP);
      if (options.detailFromZoom !== undefined) {
        detail = map.getZoom() >= options.detailFromZoom;
      }

      // borders run along the middle of a street; on paper the line moves out past
      // it, so the street itself reads as part of the territory
      const width = detail ? 8 : 5.5;
      const metresPerPixel =
        (40075016.686 * Math.cos((boundary[0][1] * Math.PI) / 180)) /
        (512 * 2 ** map.getZoom());
      const printed = widen(
        boundary,
        STREET_HALF + (width / 2) * metresPerPixel
      );

      addOutsideVeil(map, printed, '#FFFFFF');
      addTerritoryLayers(map, { ...territory, boundary: printed }, 0);
      if (doNotCalls) addPrintDoNotCalls(map, territory, detail);
      // a printed border has to hold its own against the street names above it,
      // and on a large card against the houses and their numbers too
      map.setPaintProperty('territory-area-line', 'line-width', width);
      // the picture is always this size and printed smaller, so its dashes
      // are long enough not to read as dots at any zoom
      map.setPaintProperty(
        'territory-lines-dashed-selected',
        'line-dasharray',
        [4, 3]
      );

      streets.push(...addPrintLabels(map, boundary, detail));
      enlargeStreets();
    });

    const enlargeStreets = () => {
      const size = options.wideStreetSize;
      if (!size || detail) return;
      for (const id of [
        ...streets,
        'short-streets-along',
        'short-streets-level',
      ]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'text-size', size);
      }
    };

    const snapshot = () => {
      if (done) return;
      const canvas = document.createElement('canvas');
      try {
        canvas.width = map.getCanvas().width;
        canvas.height = map.getCanvas().height;
        const context = canvas.getContext('2d');
        if (!context) {
          cleanup();
          return;
        }
        context.drawImage(map.getCanvas(), 0, 0);
        paintMarkers(canvas, map, territory.mapMarkers ?? [], 2);
        paintMapAttribution(canvas, printedPoints);
        cleanup(
          options.jpeg
            ? canvas.toDataURL('image/jpeg', 0.9)
            : canvas.toDataURL('image/png')
        );
      } catch {
        cleanup();
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    };

    let fine: StreetFeature[] | undefined;

    const levelOrSnapshot = () => {
      const all = [...streets, 'short-streets-along'];
      if (labelShortStreets(map, boundary, all, false, fine)) {
        enlargeStreets();
        map.once('idle', snapshot);
      } else snapshot();
    };

    map.once('idle', async () => {
      fine = await fineStreets(map);
      if (done) return;
      const numbers = insideHouseNumbers(map, boundary);
      if (labelShortStreets(map, boundary, streets, true, fine) || numbers) {
        enlargeStreets();
        map.once('idle', levelOrSnapshot);
      } else levelOrSnapshot();
    });

    // a missing tile still leaves a usable picture; only a basemap that never loads fails
    map.on('error', () => {
      if (!styled) cleanup();
    });
  });

// house numbers only inside the border; the map's own inside test fails on
// overzoomed tiles, so the inside ones are picked here and drawn on their own
const insideHouseNumbers = (
  map: maplibregl.Map,
  boundary: [number, number][]
) => {
  let added = false;
  for (const layer of map.getStyle().layers) {
    if (!isHouseNumber(layer) || layer.type !== 'symbol') continue;
    if (layer.layout?.visibility === 'none') continue;

    // the tiles keep a house's number as a MultiPoint, often repeated per tile
    const seen = new Set<string>();
    const features = map
      .querySourceFeatures(layer.source, {
        sourceLayer: layer['source-layer'],
      })
      .flatMap((feature) => {
        const { geometry } = feature;
        const points =
          geometry.type === 'Point'
            ? [geometry.coordinates]
            : geometry.type === 'MultiPoint'
              ? geometry.coordinates
              : [];
        return points.map((point) => [feature, point] as const);
      })
      .filter(([feature, point]) => {
        const key = `${point}:${JSON.stringify(feature.properties)}`;
        if (seen.has(key) || !contains(point, boundary)) return false;
        seen.add(key);
        return true;
      })
      .map(([feature, point]) => ({
        type: 'Feature' as const,
        // plain copies: the map's worker cannot take the tile's own objects
        properties: { ...feature.properties },
        geometry: { type: 'Point' as const, coordinates: [point[0], point[1]] },
      }));

    const id = `${layer.id}-inside`;
    map.addSource(id, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    });
    const { 'source-layer': _, filter: __, ...spec } = layer;
    map.addLayer({ ...spec, id, source: id }, layer.id);
    map.setLayoutProperty(layer.id, 'visibility', 'none');
    added = true;
  }
  return added;
};

// a street too short for its name at the style's size gets a smaller one along its
// own course; only a name that still finds no room is set level on its middle
const streetCoordinates = (geometry: GeoJSON.Geometry): number[][][] => {
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
};

// metres between two points, near enough for a few hundred metres
const metres = (a: number[], b: number[]) =>
  Math.hypot(
    (b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180),
    (b[1] - a[1]) * 110540
  );

// tiles cut a road at their edges, each piece reaching a little into the next
// tile, and a road is often several ways; join the pieces back into whole roads
const PIECE_GAP = 120;

const joinPieces = (pieces: number[][][]) => {
  const left = pieces.filter((piece) => piece.length > 1);
  const roads: number[][][] = [];

  // the next piece's points from just past where the road ends now
  const after = (end: number[], piece: number[][]) => {
    let nearest = 0;
    for (let i = 1; i < piece.length; i++) {
      if (metres(piece[i], end) < metres(piece[nearest], end)) nearest = i;
    }
    return metres(piece[nearest], end) <= PIECE_GAP
      ? piece.slice(nearest + 1)
      : undefined;
  };

  const extend = (road: number[][]) => {
    for (let i = 0; i < left.length; i++) {
      const end = road[road.length - 1];
      const next =
        (metres(left[i][0], end) <= PIECE_GAP && after(end, left[i])) ||
        (metres(left[i][left[i].length - 1], end) <= PIECE_GAP &&
          after(end, [...left[i]].reverse()));
      if (!next) continue;
      road.push(...next);
      left.splice(i, 1);
      i = -1;
    }
    return road;
  };

  while (left.length) {
    const road = extend([...left.shift()!]);
    roads.push(extend(road.reverse()));
  }
  return roads;
};

const missingStreetRuns = (
  map: maplibregl.Map,
  spec: maplibregl.SymbolLayerSpecification,
  boundary: [number, number][],
  shown: Set<string>,
  fine?: StreetFeature[]
) => {
  const runs = new Map<string, number[][]>();
  const pieces = new Map<string, number[][][]>();

  for (const feature of fine ??
    map.querySourceFeatures(spec.source, {
      sourceLayer: spec['source-layer'],
    })) {
    const name = feature.properties.name;
    if (!name || shown.has(name)) continue;
    pieces.set(name, [
      ...(pieces.get(name) ?? []),
      ...streetCoordinates(feature.geometry),
    ]);
  }

  for (const [name, lines] of pieces) {
    // Tile vertices need not fall inside the boundary. Keep the longest visible run.
    for (const line of joinPieces(lines)) {
      for (const run of streetRuns(line, boundary)) {
        if (streetLength(run) > streetLength(runs.get(name) ?? [])) {
          runs.set(name, run);
        }
      }
    }
  }

  return runs;
};

// the run's direction on screen, in degrees clockwise, never upside down
const streetAngle = (map: maplibregl.Map, run: number[][]) => {
  const start = map.project(run[0] as [number, number]);
  const end = map.project(run[run.length - 1] as [number, number]);
  const angle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  if (angle > 90) return angle - 180;
  if (angle <= -90) return angle + 180;
  return angle;
};

const SHORT_STREET_SIZE = 10;

// on a wide map: the shortest road that gets a name, as a share of the map's width,
// and the room around each name, in pixels
const WIDE_RUN_MIN = 0.075;
const WIDE_LABEL_GAP = 12;

// a wide map leaves out the lines of its smallest roads; a name there would float
const roadDrawn = (map: maplibregl.Map, run: number[][]) => {
  const { x, y } = map.project(streetMidpoint(run) as [number, number]);
  return map
    .queryRenderedFeatures([
      [x - 4, y - 4],
      [x + 4, y + 4],
    ])
    .some((feature) => feature.sourceLayer === 'transportation');
};

// a level name can only follow a road that runs about straight
const straight = (map: maplibregl.Map, run: number[][]) => {
  const start = map.project(run[0] as [number, number]);
  const end = map.project(run[run.length - 1] as [number, number]);
  return (
    Math.hypot(end.x - start.x, end.y - start.y) >= screenLength(map, run) * 0.9
  );
};

const screenLength = (map: maplibregl.Map, run: number[][]) =>
  run.slice(1).reduce((sum, point, index) => {
    const a = map.project(run[index] as [number, number]);
    const b = map.project(point as [number, number]);
    return sum + Math.hypot(b.x - a.x, b.y - a.y);
  }, 0);

const labelShortStreets = (
  map: maplibregl.Map,
  boundary: [number, number][],
  layers: string[],
  along: boolean,
  fine?: StreetFeature[]
) => {
  const spec = map.getStyle().layers.find((layer) => layer.id === layers[0]);
  if (spec?.type !== 'symbol') return false;

  const shown = new Set(
    map
      .queryRenderedFeatures({
        // An outside label must not suppress a useful label inside the territory.
        layers: layers.filter(
          (id) =>
            map.getLayer(id) &&
            (id.endsWith('-inside') || id.startsWith('short-streets-'))
        ),
      })
      .map((feature) => feature.properties.name)
  );

  const runs = missingStreetRuns(map, spec, boundary, shown, fine);

  const id = along ? 'short-streets-along' : 'short-streets-level';
  const features = [...runs]
    .filter(([, run]) => !along || run.length > 1)
    .filter(
      ([, run]) =>
        !fine ||
        (screenLength(map, run) >=
          map.getContainer().clientWidth * WIDE_RUN_MIN &&
          roadDrawn(map, run) &&
          (along || straight(map, run)))
    )
    // the longest roads first, so the same names win on every render
    .sort(
      ([a, x], [b, y]) =>
        screenLength(map, y) - screenLength(map, x) || a.localeCompare(b)
    )
    .map(([name, run], rank) => ({
      type: 'Feature' as const,
      properties: { name, rank, angle: streetAngle(map, run) },
      geometry: along
        ? { type: 'LineString' as const, coordinates: run }
        : {
            type: 'Point' as const,
            coordinates: streetMidpoint(run),
          },
    }));

  if (!features.length) return false;

  map.addSource(id, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
  });

  map.addLayer({
    id,
    type: 'symbol',
    source: id,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': spec.layout?.['text-font'],
      'text-size': SHORT_STREET_SIZE,
      'text-padding': fine ? WIDE_LABEL_GAP : 0,
      'symbol-sort-key': ['get', 'rank'],
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      ...(along
        ? {
            'symbol-placement': 'line-center' as const,
            'text-max-angle': 80,
            'text-keep-upright': true,
          }
        : {
            // on a wide map a name moved off its road reads as another road's
            'text-variable-anchor': fine
              ? ['center']
              : ['center', 'top', 'bottom', 'left', 'right'],
            'text-radial-offset': fine ? 0 : 0.6,
            // too short to bend along, but still turned the street's way
            'text-rotate': ['get', 'angle'],
            'text-rotation-alignment': 'map' as const,
          }),
    },
    paint: {
      'text-color': '#333333',
      'text-halo-color': '#FFFFFF',
      'text-halo-width': 1.5,
    },
  });

  return true;
};

let captures: Promise<unknown> = Promise.resolve();
export const captureTerritoryMap = (
  territory: Territory,
  ratio = 1.74,
  inset = 0,
  printedPoints = SIZE * 0.24,
  detail = false,
  doNotCalls = false,
  options: CaptureOptions = {}
): Promise<string | undefined> => {
  const next = captures.then(() =>
    capture(territory, ratio, inset, printedPoints, detail, doNotCalls, options)
  );
  captures = next.catch(() => {});
  return next;
};
