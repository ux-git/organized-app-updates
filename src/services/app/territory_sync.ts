import { dbTerritorySyncDiscard } from '@services/dexie/territory_sync';
import { territorySharedSettingsState } from '@states/territories';
import type { TerritorySharedSettings } from '@definition/territory_sync';
import { dbTerritorySettingsSave } from '@services/dexie/territory_sync';
import { decryptTerritoryContent } from '@services/app/territory_codec';
import { store } from '@states/index';
import { userIDState, isOnlineState } from '@states/app';
import {
  congIDState,
  congAccessCodeState,
  congDataSyncState,
} from '@states/settings';
import {
  territorySyncPendingState,
  territorySyncStatusState,
} from '@states/territory_sync';
import { territoryAssigneesState } from '@features/territories/assignees';
import {
  apiGetTerritories,
  apiSendTerritories,
  apiSetTerritoryPolicy,
  TerritoryApiError,
} from '@services/api/territories';
import {
  dbTerritorySyncGet,
  dbTerritorySyncPrepare,
  dbTerritorySyncApply,
  dbTerritoriesEnqueue,
} from '@services/dexie/territory_sync';
import { dbTerritoriesGetAll } from '@services/dexie/territories';
import {
  decodeTerritory,
  encryptTerritoryContent,
  territoryRemoteId,
  TerritoryIdentityError,
} from '@services/app/territory_codec';
import { prepareTerritoryCommands } from '@services/app/territory_commands';
import {
  buildTerritoryGrants,
  isTerritorySyncManager,
} from '@services/app/territory_policy';
import { isTest } from '@constants/index';
import type {
  TerritoryPendingOperation,
  TerritorySnapshot,
} from '@definition/territory_sync';
import type { TerritoryRecord } from '@definition/territory_record';

const scopeNow = () => `${store.get(congIDState)}:${store.get(userIDState)}`;
const assertAccount = (scope: string) => {
  if (scope !== scopeNow()) throw new TerritoryApiError(403);
};
const localSnapshot = (
  snapshot: TerritorySnapshot,
  key: string
): TerritoryRecord[] => {
  const assignees = store.get(territoryAssigneesState);
  return snapshot.records
    .filter((record) => !record.deleted)
    .map((record) => {
      const data = decodeTerritory(record, assignees, key);
      if (territoryRemoteId(record.dataView, data.id) !== record.id)
        throw new TerritoryIdentityError('Territory identifier does not match');
      return {
        id: `${record.dataView}:${data.id}`,
        dataView: record.dataView,
        updatedAt: record.updatedAt,
        deleted: false,
        data,
        remote: record,
      };
    });
};
const applySnapshot = async (
  scope: string,
  key: string,
  snapshot: TerritorySnapshot,
  acknowledged?: string
) => {
  assertAccount(scope);
  await dbTerritorySyncApply(
    scope,
    snapshot.revision,
    localSnapshot(snapshot, key),
    acknowledged
  );
};
const prepare = (
  operation: TerritoryPendingOperation,
  snapshot: TerritorySnapshot,
  key: string
) => {
  const manager = isTerritorySyncManager();
  const assignees = store.get(territoryAssigneesState);
  const commands = operation.changes.flatMap((change) => {
    const territory = change.after ?? change.before;
    if (!territory) throw new TerritoryIdentityError('Territory data missing');
    const id = territoryRemoteId(change.dataView, territory.id);
    const remote = snapshot.records.find((item) => item.id === id);
    if ((remote?.revision ?? 0) !== change.baseRevision || remote?.deleted)
      throw new TerritoryApiError(409);
    return prepareTerritoryCommands(change, manager, assignees, key).map(
      (command) => ({ id, command })
    );
  });
  if (commands.length > 20) throw new TerritoryApiError(413);
  return {
    operationId: operation.id,
    expectedRevision: snapshot.revision,
    commands,
  };
};
const synchronizePolicy = async (
  scope: string,
  snapshot: TerritorySnapshot,
  key: string
) => {
  assertAccount(scope);
  const state = await dbTerritorySyncGet();
  const remote = snapshot.policy.content
    ? decryptTerritoryContent<Partial<TerritorySharedSettings>>(
        snapshot.policy.content,
        key
      )
    : {};
  const settings = state?.settingsDirty
    ? state.settings
    : remote.categories
      ? (remote as TerritorySharedSettings)
      : store.get(territorySharedSettingsState);
  if (!settings)
    throw new TerritoryIdentityError('Territory settings are unavailable');
  if (!isTerritorySyncManager()) {
    if (remote.categories)
      await dbTerritorySettingsSave(scope, settings, false);
    return snapshot;
  }
  const grants = buildTerritoryGrants();
  if (!grants.length) return snapshot;
  if (
    !state?.settingsDirty &&
    remote.categories &&
    JSON.stringify(grants) === JSON.stringify(snapshot.policy.grants)
  ) {
    await dbTerritorySettingsSave(scope, settings, false);
    return snapshot;
  }
  await apiSetTerritoryPolicy(scope, {
    revision: snapshot.policy.revision,
    grants,
    content: encryptTerritoryContent(settings, key),
  });
  assertAccount(scope);
  await dbTerritorySettingsSave(scope, settings, false);
  return apiGetTerritories(scope);
};
const migrateLocal = async (scope: string, snapshot: TerritorySnapshot) => {
  if (!isTerritorySyncManager()) return;
  const state = await dbTerritorySyncGet();
  const pending = new Set(
    state?.queue.flatMap((item) => item.changes.map((change) => change.id))
  );
  const remote = new Set(snapshot.records.map((item) => item.id));
  const local = (await dbTerritoriesGetAll()).filter(
    (item) =>
      !item.remote &&
      !item.deleted &&
      !pending.has(item.id) &&
      !remote.has(territoryRemoteId(item.dataView, item.data.id))
  );
  // Legacy imports are independent records. User map operations stay atomic in their original queue entry.
  for (let index = 0; index < local.length; index += 20)
    await dbTerritoriesEnqueue(local.slice(index, index + 20), scope);
};
const run = async () => {
  const scope = scopeNow();
  const key = store.get(congAccessCodeState);
  const state = await dbTerritorySyncGet();
  if (state && state.scope !== scope) throw new TerritoryApiError(403);
  let operation = state?.queue[0];
  // Retry the exact persisted ciphertext before any policy update. The server receipt handles a lost acknowledgement.
  if (operation?.prepared) {
    assertAccount(scope);
    await apiSendTerritories(scope, operation.prepared);
    await applySnapshot(
      scope,
      key,
      await apiGetTerritories(scope),
      operation.id
    );
  }
  let snapshot = await synchronizePolicy(
    scope,
    await apiGetTerritories(scope),
    key
  );
  assertAccount(scope);
  await migrateLocal(scope, snapshot);
  await applySnapshot(scope, key, snapshot);
  operation = (await dbTerritorySyncGet())?.queue[0];
  while (operation) {
    assertAccount(scope);
    const batch = operation.prepared ?? prepare(operation, snapshot, key);
    await dbTerritorySyncPrepare(scope, operation.id, batch);
    assertAccount(scope);
    await apiSendTerritories(scope, batch);
    snapshot = await apiGetTerritories(scope);
    await applySnapshot(scope, key, snapshot, operation.id);
    operation = (await dbTerritorySyncGet())?.queue[0];
  }
};
let running: Promise<void> | undefined;
export const synchronizeTerritories = () => {
  if (running) return running;
  if (
    isTest ||
    !store.get(isOnlineState) ||
    !store.get(congDataSyncState) ||
    !store.get(congAccessCodeState) ||
    !store.get(congIDState) ||
    !store.get(userIDState)
  )
    return Promise.resolve();
  const execute = async () => {
    store.set(territorySyncStatusState, 'syncing');
    try {
      await run();
      store.set(territorySyncStatusState, 'idle');
    } catch (error) {
      const status = error instanceof TerritoryApiError ? error.status : 0;
      store.set(
        territorySyncStatusState,
        error instanceof TerritoryIdentityError
          ? 'identity'
          : status === 409
            ? 'conflict'
            : status === 404
              ? 'unavailable'
              : 'failed'
      );
    } finally {
      store.set(
        territorySyncPendingState,
        (await dbTerritorySyncGet().catch(() => undefined))?.queue.length ?? 0
      );
    }
  };
  running = (
    navigator.locks
      ? navigator.locks.request('organized-territories', execute)
      : execute()
  ).finally(() => {
    running = undefined;
  });
  return running;
};

export const discardPendingTerritories = async (reviewed: string[]) => {
  if (running) await running;
  const scope = scopeNow();
  const key = store.get(congAccessCodeState);
  const discard = async () => {
    const snapshot = await apiGetTerritories(scope);
    assertAccount(scope);
    await dbTerritorySyncDiscard(scope, reviewed, localSnapshot(snapshot, key), snapshot.revision);
    store.set(territorySyncStatusState, 'idle');
  };
  if (navigator.locks) await navigator.locks.request('organized-territories', discard);
  else await discard();
};
