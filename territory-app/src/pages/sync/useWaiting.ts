import { useCallback, useEffect, useState } from 'react';
import { invoke, listen } from '../../native';
import { list, t } from '../../i18n';
import { Described, fieldLabel } from './text';

export type WaitingItem = Described & {
  record: string;
  fields: string[];
  stamp: string;
  added: boolean;
  deleted: boolean;
  mine: boolean;
};

export const what = (item: WaitingItem) => {
  if (item.deleted) return t('history.deleted');
  if (item.added) return t('changes.added');
  return list(item.fields.map(fieldLabel));
};

// a stamp starts with its time in milliseconds, as 13 hex digits
export const seconds = (stamp: string) =>
  parseInt(stamp.slice(0, 13), 16) / 1000;

/** The records counted as waiting to sync, newest first. */
const useWaiting = (pending: number) => {
  const [records, setRecords] = useState<WaitingItem[]>([]);

  const refresh = useCallback(() => {
    invoke<WaitingItem[]>('unsynced_records')
      .then(setRecords)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const stop = listen('store-changed', refresh);
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }, [refresh, pending]);

  return pending > 0 ? records : [];
};

export default useWaiting;
