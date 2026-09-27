import * as maplibregl from 'maplibre-gl';
import { Territory } from '@definition/territory';
import { DEFAULT_BOUNDARY_STYLE, MAP_COLORS } from './constants';
import {
  boundaryCollection,
  drawnColor,
  lineCollection,
  shapeCollection,
  labelOpacity,
} from './helpers';

// the dashed lines inside a territory are drawn as thick as its border
export const BORDER_WIDTH: maplibregl.ExpressionSpecification = [
  'case',
  ['boolean', ['get', 'selected'], false],
  3,
  1.5,
];

export const FILL_OPACITY: maplibregl.ExpressionSpecification = [
  'case',
  ['get', 'filled'],
  ['case', ['get', 'selected'], 0.45, 0.18],
  0,
];

export const addBoundaryLayers = (
  map: maplibregl.Map,
  source: string,
  ids: { fill: string; line: string }
) => {
  map.addLayer({
    id: ids.fill,
    type: 'fill',
    source,
    paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': FILL_OPACITY },
  });

  map.addLayer({
    id: ids.line,
    type: 'line',
    source,
    paint: { 'line-color': ['get', 'color'], 'line-width': BORDER_WIDTH },
  });
};

export const addDrawingLayers = (
  map: maplibregl.Map,
  territories: Territory[],
  prefix = 'drawing',
  selectedId?: string
) => {
  map.addSource(`${prefix}-shapes`, {
    type: 'geojson',
    data: shapeCollection(territories),
  });

  map.addSource(`${prefix}-lines`, {
    type: 'geojson',
    data: lineCollection(territories, selectedId),
  });

  map.addLayer({
    id: `${prefix}-shapes-fill`,
    type: 'fill',
    source: `${prefix}-shapes`,
    filter: ['!=', ['get', 'fill'], ''],
    paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': 0.35 },
  });

  map.addLayer({
    id: `${prefix}-shapes-line`,
    type: 'line',
    source: `${prefix}-shapes`,
    filter: ['!=', ['get', 'border'], ''],
    paint: { 'line-color': ['get', 'border'], 'line-width': 2.5 },
  });

  map.addLayer({
    id: `${prefix}-lines-solid`,
    type: 'line',
    source: `${prefix}-lines`,
    filter: ['==', ['get', 'style'], 'solid'],
    paint: { 'line-color': MAP_COLORS.blue, 'line-width': 3 },
  });

  // a width that depends on the feature stretches the dashes several times,
  // so each border width gets its own layer with a fixed one
  for (const selected of [false, true]) {
    map.addLayer({
      id: `${prefix}-lines-dashed${selected ? '-selected' : ''}`,
      type: 'line',
      source: `${prefix}-lines`,
      filter: [
        'all',
        ['==', ['get', 'style'], 'dashed'],
        ['==', ['boolean', ['get', 'selected'], false], selected],
      ],
      paint: {
        'line-color': MAP_COLORS.green,
        'line-width': selected ? 3 : 1.5,
        // the lines grow longer on screen as you zoom in, so the dashes may too
        'line-dasharray': [
          'step',
          ['zoom'],
          ['literal', [1, 1]],
          16,
          ['literal', [1.5, 1]],
          18,
          ['literal', [2, 1.2]],
        ],
        // the overview stays clean: a territory's dashes come with its number
        ...(!selected && { 'line-opacity': labelOpacity(1) }),
      },
    });
  }
};

export const setDrawingData = (
  map: maplibregl.Map,
  territories: Territory[],
  prefix = 'drawing',
  selectedId?: string
) => {
  (
    map.getSource(`${prefix}-shapes`) as maplibregl.GeoJSONSource | undefined
  )?.setData(shapeCollection(territories));

  (
    map.getSource(`${prefix}-lines`) as maplibregl.GeoJSONSource | undefined
  )?.setData(lineCollection(territories, selectedId));
};

// one territory as the coverage map shows it once picked, in its drawn colors
export const addTerritoryLayers = (
  map: maplibregl.Map,
  territory: Territory,
  fillOpacity?: number
) => {
  const style = territory.boundaryStyle ?? DEFAULT_BOUNDARY_STYLE;

  map.addSource('territory-area', {
    type: 'geojson',
    data: boundaryCollection([territory], {
      colorOf: () => drawnColor(style.border) || MAP_COLORS.blue,
      fillOf: () => drawnColor(style.fill),
      detailOf: () => '',
      selectedId: territory.id,
    }),
  });

  addBoundaryLayers(map, 'territory-area', {
    fill: 'territory-area-fill',
    line: 'territory-area-line',
  });

  // a printed map keeps the area clear to write on
  if (fillOpacity !== undefined) {
    map.setPaintProperty('territory-area-fill', 'fill-opacity', fillOpacity);
  }

  addDrawingLayers(map, [territory], 'territory', territory.id);
};

// the world with the territory cut out, laid over the basemap so the area itself stands out
export const addOutsideVeil = (
  map: maplibregl.Map,
  boundary: [number, number][],
  color: string
) => {
  map.addSource('outside-veil', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-180, -85],
            [180, -85],
            [180, 85],
            [-180, 85],
            [-180, -85],
          ],
          boundary,
        ],
      },
    },
  });

  map.addLayer({
    id: 'outside-veil',
    type: 'fill',
    source: 'outside-veil',
    paint: { 'fill-color': color, 'fill-opacity': 0.6 },
  });
};
