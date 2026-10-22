import { useState } from 'react';
import { useAtomValue } from 'jotai';
import {
  nearbyAutomaticState,
  nearbyAvailableState,
  nearbyPeersState,
  nearbyStatusState,
} from '@states/local_sync';
import { nearby } from '@services/local_sync/nearby';

const useNearbyDevices = () => {
  const available = useAtomValue(nearbyAvailableState);
  const peers = useAtomValue(nearbyPeersState);
  const status = useAtomValue(nearbyStatusState);
  const automatic = useAtomValue(nearbyAutomaticState);

  const [pairOpen, setPairOpen] = useState(false);
  const [unpairing, setUnpairing] = useState<string>();

  const busy = status.state === 'connecting' || status.state === 'exchanging';

  const handleSyncNow = (id?: string) => nearby('syncNow', id ? { id } : {});

  const handleToggleAutomatic = () =>
    nearby('settings', { automatic: !automatic });

  const handleOpenPair = () => setPairOpen(true);

  const handleClosePair = () => {
    nearby('cancel');
    setPairOpen(false);
  };

  const handleUnpair = (id: string) => setUnpairing(id);

  const handleUnpairCancel = () => setUnpairing(undefined);

  const handleUnpairConfirm = () => {
    if (unpairing) nearby('unpair', { id: unpairing });
    setUnpairing(undefined);
  };

  return {
    available,
    peers,
    status,
    automatic,
    busy,
    pairOpen,
    unpairing,
    handleSyncNow,
    handleToggleAutomatic,
    handleOpenPair,
    handleClosePair,
    handleUnpair,
    handleUnpairCancel,
    handleUnpairConfirm,
  };
};

export default useNearbyDevices;
