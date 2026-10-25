import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GeoJSONStoreFeatures } from 'terra-draw';
import {
  isDrawingGuide,
  pendingSplitLine,
} from '../src/features/territories/map/drawing_snapshot';

const line = (coordinates: number[][]): GeoJSONStoreFeatures => ({
  type: 'Feature',
  id: 'cut',
  properties: { mode: 'linestring', currentlyDrawing: true },
  geometry: { type: 'LineString', coordinates },
});

test('split uses placed vertices and never the moving cursor position', () => {
  assert.deepEqual(
    pendingSplitLine([
      line([
        [13, 52],
        [14, 53],
        [15, 54],
      ]),
    ]),
    [
      [13, 52],
      [14, 53],
    ]
  );
  assert.deepEqual(
    pendingSplitLine([
      line([
        [13, 52],
        [14, 53],
      ]),
    ]),
    []
  );
  assert.deepEqual(
    pendingSplitLine([
      line([
        [13, 52],
        [13, 52],
        [14, 53],
      ]),
    ]),
    []
  );
});

test('Terra Draw guide points are not saved as location markers', () => {
  for (const key of [
    'selectionPoint',
    'midPoint',
    'closingPoint',
    'snappingPoint',
    'coordinatePoint',
  ]) {
    const point: GeoJSONStoreFeatures = {
      type: 'Feature',
      id: key,
      properties: { mode: 'point', [key]: true },
      geometry: { type: 'Point', coordinates: [13, 52] },
    };
    assert.equal(isDrawingGuide(point), true);
  }
  assert.equal(
    isDrawingGuide({
      type: 'Feature',
      id: 'pin',
      properties: { mode: 'point', kind: 'pin' },
      geometry: { type: 'Point', coordinates: [13, 52] },
    }),
    false
  );
});
