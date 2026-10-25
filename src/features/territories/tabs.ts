import type {
  Territory,
  TerritoryRecommendations,
  TerritoryRestrictions,
  TerritoryTab,
} from '@definition/territory';
import { addMonths } from 'date-fns';
import { coveredAge } from '@features/territories/coverage_rate';

export const NO_RESTRICTIONS: TerritoryRestrictions = {
  categories: [],
  types: [],
};

// territories the congregation keeps out of the pool are never offered on their own;
// an elder still assigns them by hand, after speaking with the publisher
const isOffered = (territory: Territory, restricted: TerritoryRestrictions) =>
  !restricted.types.includes(territory.type) &&
  !territory.categories.some((category) =>
    restricted.categories.includes(category)
  );

export const pastCooldown = (
  territory: Territory,
  months: number,
  now = new Date()
) => {
  if (!months) return true;
  const returned = territory.assignments
    .flatMap((item) => {
      if (!item.returnedOn) return [];
      const [day, month, year] = item.returnedOn.split('.').map(Number);
      const date = new Date(year, month - 1, day);
      return Number.isNaN(date.getTime()) ? [] : [date];
    })
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return !returned || addMonths(returned, months) <= now;
};

const recommendedTerritories = (
  territories: Territory[],
  restricted: TerritoryRestrictions,
  recommendations?: TerritoryRecommendations
) =>
  territories
    .filter(
      (territory) =>
        territory.status === 'available' &&
        !territory.cardLost &&
        !territory.requestedBy &&
        isOffered(territory, restricted) &&
        (!recommendations ||
          (isOffered(territory, recommendations) &&
            pastCooldown(territory, recommendations.cooldownMonths)))
    )
    .sort((a, b) => coveredAge(b) - coveredAge(a));

// `me` is the current publisher's name, as territories store their holders
export const forTab = (
  territories: Territory[],
  tab: TerritoryTab,
  me: string,
  isEditor = true,
  groupHolder?: string,
  restricted: TerritoryRestrictions = NO_RESTRICTIONS,
  recommendations?: TerritoryRecommendations
) => {
  if (tab === 'group') {
    return groupHolder
      ? territories.filter(
          (territory) =>
            territory.holderGroup === groupHolder ||
            territory.holder === groupHolder
        )
      : [];
  }

  if (tab === 'requests') {
    return territories.filter((territory) => territory.requestedBy);
  }

  if (tab === 'requested') {
    return territories.filter(
      (territory) => !!me && territory.requestedBy === me
    );
  }

  if (tab === 'recommended') {
    return recommendedTerritories(
      territories,
      isEditor ? NO_RESTRICTIONS : restricted,
      recommendations
    );
  }

  if (tab === 'all' && !isEditor) {
    return territories.filter(
      (territory) =>
        territory.status === 'available' && isOffered(territory, restricted)
    );
  }

  if (tab === 'mine') {
    return territories.filter((territory) => !!me && territory.holder === me);
  }

  return territories;
};
