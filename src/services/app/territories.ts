import type { Territory } from '@definition/territory';
import type { TerritoryRecord } from '@definition/territory_record';
import { dbTerritoriesSave } from '@services/dexie/territories';

export const saveTerritoryChanges = async (
  previous: Territory[],
  next: Territory[],
  dataView: string
) => {
  const before = new Map(
    previous.map((territory) => [territory.id, territory])
  );
  const after = new Map(next.map((territory) => [territory.id, territory]));
  const updatedAt = new Date().toISOString();
  const records: TerritoryRecord[] = [];
  for (const territory of next) {
    if (
      before.get(territory.id) === territory ||
      JSON.stringify(before.get(territory.id)) === JSON.stringify(territory)
    )
      continue;
    records.push({
      id: `${dataView}:${territory.id}`,
      dataView,
      updatedAt,
      deleted: false,
      data: territory,
    });
  }
  for (const territory of previous) {
    if (!after.has(territory.id))
      records.push({
        id: `${dataView}:${territory.id}`,
        dataView,
        updatedAt,
        deleted: true,
        data: territory,
      });
  }
  if (records.length) await dbTerritoriesSave(records);
};
