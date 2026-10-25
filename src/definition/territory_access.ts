import type {
  TerritoryAccess,
  TerritoryRestrictions,
} from '@definition/territory';

export type TerritoryAccessContext = {
  editor: boolean;
  publisher: string;
  eligiblePublisher: boolean;
  access: TerritoryAccess;
  groupHolder?: string;
  restricted: TerritoryRestrictions;
};
