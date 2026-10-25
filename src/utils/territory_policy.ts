import type { TerritoryGrant } from '@definition/territory_sync';

export class TerritoryPolicyConflict extends Error {}
const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
const mergeGrant = (
  before: TerritoryGrant,
  local: TerritoryGrant,
  remote: TerritoryGrant
) => {
  const merged = { ...remote };
  for (const key of Object.keys(local) as (keyof TerritoryGrant)[]) {
    if (same(local[key], before[key])) continue;
    if (!same(remote[key], before[key]) && !same(remote[key], local[key]))
      throw new TerritoryPolicyConflict();
    Object.assign(merged, { [key]: local[key] });
  }
  return merged;
};
/** Apply only locally changed permission fields. A stale device must never restore a remotely revoked right. */
export const mergeTerritoryGrants = (
  baseline: TerritoryGrant[] | undefined,
  local: TerritoryGrant[],
  remote: TerritoryGrant[],
  initialize = false
) => {
  if (!baseline && (!initialize || remote.length)) return remote;
  const before = new Map((baseline ?? []).map((item) => [item.personId, item]));
  const result = new Map(remote.map((item) => [item.personId, item]));
  for (const grant of local) {
    const previous = before.get(grant.personId);
    const current = result.get(grant.personId);
    if (!previous) {
      if (!current) result.set(grant.personId, grant);
      continue;
    }
    if (same(previous, grant)) continue;
    if (!current) throw new TerritoryPolicyConflict();
    result.set(grant.personId, mergeGrant(previous, grant, current));
  }
  for (const previous of before.values()) {
    if (local.some((item) => item.personId === previous.personId)) continue;
    const current = result.get(previous.personId);
    if (current && !same(previous, current))
      throw new TerritoryPolicyConflict();
    result.delete(previous.personId);
  }
  return [...result.values()].sort((a, b) =>
    a.personId.localeCompare(b.personId)
  );
};
