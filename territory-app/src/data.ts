import { Territory, TerritoryBoundary } from '@definition/territory';

// Stands in for the territory pages' mock data. The pages read these as plain
// values, so they are filled in place from the phone's store before they render.

// Xanten-Lüttingen until the congregation's own borders are known
export const MAP_CENTER: [number, number] = [6.47, 51.67];

export const CONGREGATION_BOUNDARY: TerritoryBoundary | undefined = undefined;

// no samples; the phone's store fills the territories
const TERRITORIES: Territory[] = [];

export const sampleTerritories = () => TERRITORIES;

// street name -> territory numbers, built from OpenStreetMap by
// scripts/streets.py into seed/streets.json for a private build
export const STREET_INDEX: Record<string, string[]> =
  Object.values(
    import.meta.glob<Record<string, string[]>>('../seed/streets.json', {
      import: 'default',
      eager: true,
    })
  )[0] ?? {};

export const setMapCenter = (center: [number, number]) => {
  MAP_CENTER[0] = center[0];
  MAP_CENTER[1] = center[1];
};
