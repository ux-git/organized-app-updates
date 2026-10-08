import type * as maplibregl from 'maplibre-gl';
import { TerritoryBoundary } from '@definition/territory';

type Point = GeoJSON.Position;

const STREET_LAYERS = ['transportation_name', 'street_labels'];

// a road number like B57 or A 7 names no street
const ROAD_NUMBER = /^[A-Z]{1,3} ?\d+[a-z]?$/;

const insidePolygon = ([x, y]: Point, polygon: TerritoryBoundary) => {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
};

const side = (a: Point, b: Point, c: Point) =>
  Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));

const segmentsCross = (a: Point, b: Point, c: Point, d: Point) =>
  side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);

export const lineCrossesPolygon = (
  line: Point[],
  polygon: TerritoryBoundary
) => {
  if (line.some((point) => insidePolygon(point, polygon))) return true;

  for (let i = 1; i < line.length; i++) {
    for (let k = 0, j = polygon.length - 1; k < polygon.length; j = k++) {
      if (segmentsCross(line[i - 1], line[i], polygon[j], polygon[k])) {
        return true;
      }
    }
  }

  return false;
};

const linesOf = (geometry: GeoJSON.Geometry): Point[][] => {
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
};

// only what the loaded tiles hold, so the map has to show the whole territory
export const tileStreetNames = (
  map: maplibregl.Map,
  boundary: TerritoryBoundary
) => {
  const source = Object.entries(map.getStyle().sources).find(
    ([, value]) => value.type === 'vector'
  )?.[0];
  if (!source) return [];

  const names = new Set<string>();

  for (const sourceLayer of STREET_LAYERS) {
    for (const feature of map.querySourceFeatures(source, { sourceLayer })) {
      const name = feature.properties?.name;
      if (typeof name !== 'string' || !name || ROAD_NUMBER.test(name)) continue;
      if (names.has(name)) continue;

      if (
        linesOf(feature.geometry).some((line) =>
          lineCrossesPolygon(line, boundary)
        )
      ) {
        names.add(name);
      }
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b, 'de'));
};
