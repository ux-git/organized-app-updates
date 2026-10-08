/*
This file holds the source of the truth for congregation territories.
*/
import { atom } from 'jotai';
import { atomWithDefault } from 'jotai/utils';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_RECOMMENDATIONS,
  MapColor,
  Territory,
  TerritoryBoundary,
  TerritoryCategoryOption,
} from '@definition/territory';
import {
  CONGREGATION_BOUNDARY,
  sampleTerritories,
} from '@features/territories/mockData';
import {
  withAssignments,
  withDerivedStatus,
} from '@features/territories/helpers';
import { territoryCampaignsState } from '@features/territories/campaigns';
import { monthShortNamesState } from './app';

// the samples follow the people they name until the first edit
export const territoriesState = atomWithDefault<Territory[]>(sampleTerritories);

export const territoryCategoriesState =
  atom<TerritoryCategoryOption[]>(DEFAULT_CATEGORIES);

export const congregationBoundaryState = atom<TerritoryBoundary | undefined>(
  CONGREGATION_BOUNDARY
);

// the colour of the congregation's outline, on the map and on paper
export const congregationBorderColorState = atom<MapColor>('red');
export const congregationBorderDashedState = atom(false);

export const territoriesShowHouseholdsState = atom(true);
export const territoriesShowDoNotCallCountState = atom(true);
export const territoriesShowDoNotCallMapState = atom(true);

// the offline territories app: one territory servant, so no requests
export const territoryLocalModeState = atom(false);

export const territoryOverdueMonthsState = atom(4);
export const territoryRecommendationsState = atom(DEFAULT_RECOMMENDATIONS);

export const territoriesWithStatusState = atom((get) =>
  withDerivedStatus(
    get(territoriesState).map((territory) =>
      withAssignments(territory, territory.assignments)
    ),
    get(territoryOverdueMonthsState),
    get(territoryCampaignsState)
  )
);

export const territoryMonthsState = atom((get) => {
  const months = get(monthShortNamesState);

  return [...months.slice(8), ...months.slice(0, 8)];
});
