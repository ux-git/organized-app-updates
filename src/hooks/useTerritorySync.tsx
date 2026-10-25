import { territorySharedSettingsState } from '@states/territories';
import { userIDState } from '@states/app';
import { useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useLiveQuery } from 'dexie-react-hooks';
import { dbTerritorySyncGet } from '@services/dexie/territory_sync';
import { synchronizeTerritories } from '@services/app/territory_sync';
import { territorySyncPendingState } from '@states/territory_sync';
import { congIDState, congDataSyncState } from '@states/settings';
import { isOnlineState } from '@states/app';

const useTerritorySync = () => {
  const congregation = useAtomValue(congIDState);
  const user = useAtomValue(userIDState);
  const setSettings = useSetAtom(territorySharedSettingsState);
  const enabled = useAtomValue(congDataSyncState);
  const online = useAtomValue(isOnlineState);
  const state = useLiveQuery(dbTerritorySyncGet);
  const setPending = useSetAtom(territorySyncPendingState);
  useEffect(() => {
    if (state?.scope === `${congregation}:${user}` && state.settings)
      setSettings(state.settings);
  }, [state, congregation, user, setSettings]);
  useEffect(() => {
    setPending(state?.queue.length ?? 0);
  }, [state, setPending]);
  useEffect(() => {
    if (!enabled || !online) return;
    const refresh = () => {
      void synchronizeTerritories();
    };
    const timer = window.setTimeout(refresh, 500);
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [
    congregation,
    enabled,
    online,
    state?.queue.length,
    state?.settingsDirty,
  ]);
};
export default useTerritorySync;
