import type {
  TerritoryAccess,
  TerritoryRestrictions,
} from '@definition/territory';

export type TerritoryAccessContext = {
  editor: boolean;
  publisher: string;
  publisherId?: string;
  groupId?: string;
  eligiblePublisher: boolean;
  access: TerritoryAccess;
  groupHolder?: string;
  restricted: TerritoryRestrictions;
};
