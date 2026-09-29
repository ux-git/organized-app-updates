import type {
  Territory,
  TerritoryRestrictions,
  TerritoryTab,
} from '@definition/territory';

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

const recommendedTerritories = (
  territories: Territory[],
  restricted: TerritoryRestrictions
) =>
  territories
    .filter(
      (territory) =>
        territory.status === 'available' &&
        !territory.requestedBy &&
        isOffered(territory, restricted)
    )
    .sort((a, b) => b.daysSinceCovered - a.daysSinceCovered);

// `me` is the current publisher's name, as territories store their holders
export const forTab = (
  territories: Territory[],
  tab: TerritoryTab,
  me: string,
  isEditor = true,
  groupHolder?: string,
  restricted: TerritoryRestrictions = NO_RESTRICTIONS
) => {
  if (tab === 'group') {
    return groupHolder
      ? territories.filter((territory) => territory.holder === groupHolder)
      : [];
  }

  if (tab === 'requests') {
    return territories.filter((territory) => territory.requestedBy);
  }

  if (tab === 'requested') {
    return territories.filter((territory) => territory.requestedBy === me);
  }

  if (tab === 'recommended') {
    return recommendedTerritories(
      territories,
      isEditor ? NO_RESTRICTIONS : restricted
    );
  }

  if (tab === 'all' && !isEditor) {
    return territories.filter(
      (territory) =>
        territory.status === 'available' && isOffered(territory, restricted)
    );
  }

  if (tab === 'mine') {
    return territories.filter((territory) => territory.holder === me);
  }

  return territories;
};
