import { useState } from 'react';
import { useAtomValue } from 'jotai';
import type { TerritoryPendingOperation } from '@definition/territory_sync';
import { territorySyncPendingState, territorySyncStatusState } from '@states/territory_sync';
import { territoryLocalModeState } from '@states/territories';
import { dbTerritorySyncGet } from '@services/dexie/territory_sync';
import { discardPendingTerritories } from '@services/app/territory_sync';
import { exportFile } from '@services/files/export';

const useTerritorySyncStatus = () => {
  const status = useAtomValue(territorySyncStatusState);
  const pending = useAtomValue(territorySyncPendingState);
  const local = useAtomValue(territoryLocalModeState);
  const [review, setReview] = useState<TerritoryPendingOperation[]>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const openReview = async () => {
    try { setReview((await dbTerritorySyncGet())?.queue ?? []); setFailed(false); }
    catch { setFailed(true); }
  };
  const exportDraft = async () => {
    try { await exportFile(new Blob([JSON.stringify({ version: 1, operations: review }, null, 2)], { type: 'application/json' }), 'territory-pending-changes.json'); }
    catch { setFailed(true); }
  };
  const discard = async () => {
    if (!review) return;
    setBusy(true); setFailed(false);
    try { await discardPendingTerritories(review.map((item) => item.id)); setReview(undefined); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  const territories = [...new Map((review ?? []).flatMap((item) => item.changes.map((change) => [change.id, change.after ?? change.before] as const))).values()].filter((item) => !!item);
  return { status, pending, local, review, busy, failed, territories, openReview, exportDraft, discard, close: () => setReview(undefined) };
};
export default useTerritorySyncStatus;
