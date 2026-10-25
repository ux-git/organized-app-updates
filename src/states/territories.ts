import { isTest } from '@constants/index';
import { saveTerritoryChanges } from '@services/app/territories';
import { displaySnackNotification } from '@services/states/app';
import { getTranslation } from '@services/i18n/translation';
import { userDataViewState } from '@states/settings';
/*
This file holds the source of the truth for congregation territories.
*/
import { atom } from 'jotai';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_RECOMMENDATIONS,
  MapColor,
  Territory,
  TerritoryBoundary,
  TerritoryCategoryOption,
} from '@definition/territory';
import { CONGREGATION_BOUNDARY } from '@features/territories/mockData';
import {
  withAssignments,
  withDerivedStatus,
} from '@features/territories/helpers';
import { territoryCampaignsState } from '@features/territories/campaigns';
import { monthShortNamesState } from './app';

export const territoriesDbState = atom<Territory[]>([]);

export const territoryWritesPendingState = atom(0);
export const territoryLoadedViewState = atom<string | null>(null);

export const territoriesState = atom(
  (get) =>
    get(territoryLoadedViewState) === get(userDataViewState)
      ? get(territoriesDbState)
      : [],
  async (
    get,
    set,
    update: Territory[] | ((previous: Territory[]) => Territory[])
  ) => {
    if (get(territoryLoadedViewState) !== get(userDataViewState)) return;
    const previous = get(territoriesDbState);
    const next = typeof update === 'function' ? update(previous) : update;
    const dataView = get(userDataViewState);
    set(territoryWritesPendingState, (count) => count + 1);
    set(territoriesDbState, next);
    try {
      await saveTerritoryChanges(previous, next, dataView);
    } catch {
      if (get(territoriesDbState) === next) set(territoriesDbState, previous);
      displaySnackNotification({
        severity: 'error',
        header: getTranslation({ key: 'error_app_generic-title' }),
        message: getTranslation({ key: 'tr_territorySaveFailed' }),
      });
    } finally {
      set(territoryWritesPendingState, (count) => count - 1);
    }
  }
);

export const territoryCategoriesState =
  atom<TerritoryCategoryOption[]>(DEFAULT_CATEGORIES);

export const congregationBoundaryState = atom<TerritoryBoundary | undefined>(
  isTest ? CONGREGATION_BOUNDARY : undefined
);

export const territoriesShowHouseholdsState = atom(true);

export const congregationBorderColorState = atom<MapColor>('red');
export const congregationBorderDashedState = atom(false);
export const territoriesShowDoNotCallCountState = atom(true);
export const territoriesShowDoNotCallMapState = atom(true);
export const territoryLocalModeState = atom(false);
export const territoryRecommendationsState = atom(DEFAULT_RECOMMENDATIONS);

export const territoryOverdueMonthsState = atom(4);

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
