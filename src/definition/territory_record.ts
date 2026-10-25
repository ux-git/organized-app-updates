import type { Territory } from '@definition/territory';
export type TerritoryRecord = {
  id: string;
  dataView: string;
  updatedAt: string;
  deleted: boolean;
  data: Territory;
};
