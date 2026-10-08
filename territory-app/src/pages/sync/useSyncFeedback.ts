import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { loadIdentity } from '../../persistence';
import { NearbyStatus } from '../useNearby';
import { assignmentIssues } from '@features/territories/helpers';
import { play } from '../../haptics';
import { invoke, listen } from '../../native';
import { list, t } from '../../i18n';
import {
  describeSync,
  isRemovedReason,
  notify,
  reasonText,
  SyncResult,
} from './text';

type Row = Record<string, unknown> & { id: string };

/** Territories among those that came in whose assignments have dates that can't be right. */
const withDateIssues = async (numbers: string[]) => {
  if (!numbers.length) return [];
  const [territories, assignments] = await Promise.all([
    invoke<Row[]>('store_list', { table: 'territories' }),
    invoke<Row[]>('store_list', { table: 'assignments' }),
  ]);
  const received = new Map(
    territories
      .filter((row) => numbers.includes(String(row.number)))
      .map((row) => [row.id, String(row.number)])
  );
  const flagged = assignments
    .filter(
      (row) =>
        received.has(String(row.territory)) &&
        assignmentIssues({
          assignedOn: String(row.assignedOn ?? ''),
          returnedOn: row.returnedOn ? String(row.returnedOn) : undefined,
        }).length > 0
    )
    .map((row) => received.get(String(row.territory))!);
  return [...new Set(flagged)];
};

/** A sync finished while the app is open: a vibration and a message. */
const useSyncFeedback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const stop = listen<SyncResult>('synced', async (result) => {
      const header = t('result.syncedWith', {
        name: result.name || t('common.theOtherPhone'),
      });
      const flagged = await withDateIssues(
        (result.territories ?? []).map((item) => item.number)
      ).catch(() => []);
      // with the message, not before the store is read
      play('synced');
      const dates = flagged.length
        ? t('result.dateIssues', {
            count: flagged.length,
            numbers: list(
              flagged.map((number) => t('result.number', { number }))
            ),
          })
        : '';
      if (result.conflicts) {
        // both sides changed: leads to that sync's changes, to pick each one
        const text = [dates, describeSync(result)].filter(Boolean).join(' ');
        notify(header, text, 'message-with-button', {
          text: t('changes.reviewAction', { count: result.conflicts }),
          onClick: () => navigate(`/settings/sync?review=${result.peer ?? ''}`),
        });
        return;
      }
      if (dates) {
        notify(header, dates, 'error');
        return;
      }
      notify(header, describeSync(result));
    });
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }, [navigate]);

  // a sync stopped for a reason someone can act on: a removal from the
  // group, an app too old, a pairing only one device still has
  useEffect(() => {
    // a failure stays in the status until the exchange goes
    let shown = new Set<string>();
    const stop = listen<NearbyStatus>('nearby', (status) => {
      const failed = (status.exchanges ?? []).filter(
        (exchange) => exchange.state === 'failed' && reasonText(exchange.reason)
      );
      const keys = failed.map((item) => `${item.address}:${item.reason}`);
      failed.forEach((exchange, index) => {
        if (shown.has(keys[index])) return;
        play('error');
        notify(t('sync.notSynced'), reasonText(exchange.reason)!, 'error');
        // the core says so only through identity, with no store change
        if (isRemovedReason(exchange.reason)) loadIdentity().catch(() => {});
      });
      shown = new Set(keys);
    });
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }, []);
};

export default useSyncFeedback;
