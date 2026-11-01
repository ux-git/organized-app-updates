import { TerritoryPrintData } from '@views/territories/index.types';

// switched on but not counted yet: the card asks for a count instead of hiding it
export const householdsOf = (
  territory: TerritoryPrintData,
  t: (key: string, options?: Record<string, unknown>) => string
) => {
  if (territory.showHouseholds === false) return '';
  return territory.households > 0
    ? t('tr_territoryHouseholdsWithCount', { n: territory.households })
    : t('tr_territoryHouseholdsPleaseCount');
};

export const titleOf = (territory: TerritoryPrintData) =>
  [territory.number, territory.city].filter(Boolean).join(' – ');
