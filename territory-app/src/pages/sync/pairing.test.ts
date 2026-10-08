import { describe, expect, test } from 'vitest';
import { pairingConnection } from './pairing';
import type { NearbyStatus, SessionStatus } from '../useNearby';

const base: NearbyStatus = { running: true, bluetooth: true };
const pair: SessionStatus = {
  state: 'exchanging',
  name: 'Anna',
  peer: 'a',
  address: 'bt-a',
  mode: 1,
};

describe('pairing completion', () => {
  test('closes after mutual acceptance while the initial sync is still running', () => {
    expect(
      pairingConnection({ ...base, exchanges: [pair] }, null, 10, new Set())
        ?.name
    ).toBe('Anna');
  });
  test('does not report success at the code check or after failure', () => {
    for (const state of ['connecting', 'confirm', 'failed'] as const) {
      expect(
        pairingConnection(
          { ...base, exchanges: [{ ...pair, state }] },
          null,
          10,
          new Set()
        )
      ).toBeUndefined();
    }
  });
  test('ignores ordinary sync and sessions from before the dialog opened', () => {
    expect(
      pairingConnection(
        { ...base, exchanges: [{ ...pair, mode: 0 }] },
        null,
        10,
        new Set()
      )
    ).toBeUndefined();
    expect(
      pairingConnection(
        { ...base, exchanges: [pair] },
        null,
        10,
        new Set(['bt-a:a'])
      )
    ).toBeUndefined();
    expect(
      pairingConnection(
        { ...base, lastDone: { ...pair, state: 'done', at: 9 } },
        null,
        10,
        new Set()
      )
    ).toBeUndefined();
    expect(
      pairingConnection(
        { ...base, lastDone: { ...pair, mode: 0, state: 'done', at: 11 } },
        null,
        10,
        new Set()
      )
    ).toBeUndefined();
  });
  test('accepts NFC and completed pairing even after its exchange disappeared', () => {
    expect(
      pairingConnection(base, { ...pair, mode: 2 }, 10, new Set())?.name
    ).toBe('Anna');
    expect(
      pairingConnection(
        { ...base, lastDone: { ...pair, state: 'done', at: 11 } },
        null,
        10,
        new Set()
      )?.name
    ).toBe('Anna');
  });
});
