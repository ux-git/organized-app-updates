import type { NearbyStatus, SessionStatus } from '../useNearby';

const connected = (session?: SessionStatus | null) =>
  session?.state === 'exchanging' || session?.state === 'done';

/** Pairing has been accepted by both devices; the first sync may still be running. */
export const pairingConnection = (
  status: NearbyStatus,
  tapped: SessionStatus | null,
  openedAt: number,
  earlier: Set<string>
): SessionStatus | undefined => {
  if (!openedAt) return;
  if (connected(tapped)) return tapped!;
  const session = status.exchanges?.find(
    (item) =>
      item.mode === 1 &&
      connected(item) &&
      !earlier.has(`${item.address}:${item.peer}`)
  );
  if (session) return session;
  const done = status.lastDone;
  if (done && (done.mode === 1 || done.mode === 2) && done.at >= openedAt)
    return done;
};
