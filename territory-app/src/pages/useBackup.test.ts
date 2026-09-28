import { deflateRawSync } from 'node:zlib';
import { describe, expect, test, vi } from 'vitest';
import { backupOrigin, BACKUP_PREFIX } from './useBackup';

vi.mock('../native', () => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  nearby: vi.fn(),
}));
vi.mock('../persistence', () => ({}));
vi.mock('./confirm', () => ({}));

// as backup.rs writes it: deflated JSON, base64url without padding
const backup = (contents: object) =>
  BACKUP_PREFIX +
  deflateRawSync(JSON.stringify(contents)).toString('base64url');

describe('where a backup comes from', () => {
  test('is read from the file before restoring it', async () => {
    const text = backup({
      device: 'phone-1',
      name: 'Anna Muster',
      at: 1790000000,
      versions: {},
      cells: [{ table: 'territories', id: 't1' }],
    });
    expect(await backupOrigin(text)).toEqual({
      device: 'phone-1',
      name: 'Anna Muster',
      at: 1790000000,
    });
  });

  test('an unnamed device has an empty name', async () => {
    const text = backup({ device: 'phone-2', name: '', at: 1 });
    expect(await backupOrigin(text)).toEqual({
      device: 'phone-2',
      name: '',
      at: 1,
    });
  });

  test('a damaged file gives nothing, so the plain question is asked', async () => {
    expect(await backupOrigin(`${BACKUP_PREFIX}not-deflated`)).toBeUndefined();
    expect(await backupOrigin(backup({ something: 'else' }))).toBeUndefined();
  });
});
