import { useEffect } from 'react';
import { play } from '../../haptics';
import { listen } from '../../native';
import { describeSync, notify, SyncResult } from './text';

/** A sync finished while the app is open: a vibration and a message. */
const useSyncFeedback = () => {
  useEffect(() => {
    const stop = listen<SyncResult>('synced', (result) => {
      play('synced');
      notify(
        `Synced with ${result.name || 'the other phone'}`,
        describeSync(result)
      );
    });
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }, []);
};

export default useSyncFeedback;
