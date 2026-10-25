import type { Territory } from '@definition/territory';

// dd.mm.yyyy, as stored; kept here so the counts have no app imports
const dayOf = (value?: string) => {
  const [day, month, year] = (value ?? '').split('.').map(Number);
  if (!day || !month || !year) return null;

  return new Date(year, month - 1, day);
};

export { isTerritoryCoverage as isCoverage } from '@utils/territory_coverage';
import { isTerritoryCoverage as isCoverage } from '@utils/territory_coverage';

export const returnedWithin = (territory: Territory, start: Date, end: Date) =>
  territory.assignments.some((assignment) => {
    const returned = dayOf(assignment.returnedOn);

    return (
      isCoverage(assignment) &&
      !!returned &&
      returned >= start &&
      returned <= end
    );
  });

export const coverageRate = (
  territories: Territory[],
  { start, end }: { start: Date; end: Date }
) => {
  const total = territories.length;
  const covered = territories.filter((territory) =>
    returnedWithin(territory, start, end)
  ).length;

  return {
    rate: total ? Math.round((covered / total) * 100) : 0,
    covered,
    total,
  };
};
