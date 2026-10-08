vi.mock('@features/territories/map/constants', () => ({ MAP_PROVIDERS: {} }));
import { expect, test, vi } from 'vitest';
import type { Map, LayerSpecification } from 'maplibre-gl';
vi.mock('@utils/common', () => ({
  getCSSPropertyValue: (name: string) => name,
}));
import { styleStreetName } from '@features/territories/map/basemap';
const mockMap = (field: unknown) => ({
  getLayoutProperty: vi.fn(() => field),
  setLayerZoomRange: vi.fn(),
  setLayoutProperty: vi.fn(),
  setPaintProperty: vi.fn(),
  moveLayer: vi.fn(),
});
test('minor streets appear earlier without allowing overlaps', () => {
  const map = mockMap(['get', 'name']);
  styleStreetName(
    map as unknown as Map,
    {
      id: 'minor',
      type: 'symbol',
      minzoom: 15,
      source: 'roads',
    } as LayerSpecification
  );
  expect(map.setLayerZoomRange).toHaveBeenCalledWith('minor', 11, 24);
  expect(map.setLayoutProperty).toHaveBeenCalledWith(
    'minor',
    'text-allow-overlap',
    false
  );
  expect(map.setPaintProperty).toHaveBeenCalledWith('minor', 'text-opacity', 1);
  expect(map.moveLayer).toHaveBeenCalledWith('minor');
});
test('route shields retain their style and zoom range', () => {
  const map = mockMap(['get', 'ref']);
  styleStreetName(
    map as unknown as Map,
    { id: 'shield', type: 'symbol', source: 'roads' } as LayerSpecification
  );
  expect(map.setLayerZoomRange).not.toHaveBeenCalled();
  expect(map.setLayoutProperty).not.toHaveBeenCalled();
  expect(map.moveLayer).not.toHaveBeenCalled();
});
