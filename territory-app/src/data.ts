import { Territory, TerritoryBoundary } from '@definition/territory';

// Stands in for the territory pages' mock data. The pages read these as plain
// values, so they are filled in place from the phone's store before they render.

export const GROUPS: string[] = [];

export const PUBLISHERS_ONLY: string[] = [];

export const PUBLISHERS: string[] = [];

export const MAP_CENTER: [number, number] = [13.4105, 52.5005];

export const CONGREGATION_BOUNDARY: TerritoryBoundary | undefined = undefined;

export const TERRITORIES: Territory[] = [];

// eslint-disable-next-line import/no-mutable-exports
export let CURRENT_PUBLISHER = '';

export const setCurrentPublisher = (name: string) => {
  CURRENT_PUBLISHER = name;
};

export const setPeople = (groups: string[], publishers: string[]) => {
  GROUPS.splice(0, GROUPS.length, ...groups);
  PUBLISHERS_ONLY.splice(0, PUBLISHERS_ONLY.length, ...publishers);
  PUBLISHERS.splice(0, PUBLISHERS.length, ...groups, ...publishers);
};

export const setMapCenter = (center: [number, number]) => {
  MAP_CENTER[0] = center[0];
  MAP_CENTER[1] = center[1];
};
