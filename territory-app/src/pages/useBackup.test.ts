import { beforeEach, describe, expect, test, vi } from 'vitest';
import { store } from '@states/index';
import { invoke } from '../native';
import { myIdState } from '../profiles';
import en from '../locales/en.json';
import { confirm } from './confirm';
import { restoreBackup } from './useBackup';

vi.mock('../native', () => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  nearby: vi.fn(),
}));
vi.mock('../persistence', () => ({}));
vi.mock('./confirm', () => ({ confirm: vi.fn(async () => false) }));

// what backup_info reads from the file, and the paired devices
const answers = (info: object | null, peers: object[] = []) =>
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd === 'peers') return peers;
    if (cmd === 'backup_info' && info) return info;
    throw 'invalid backup';
  });

const question = async () => {
  await restoreBackup('OTA1:file');
  return vi.mocked(confirm).mock.calls[0][0];
};

beforeEach(() => {
  vi.mocked(confirm).mockClear();
  store.set(myIdState, 'me');
});

describe('before restoring a backup', () => {
  test('a paired device’s backup says whose and when', async () => {
    answers({ device: 'peer1', name: 'Anna Muster', at: 1790000000 }, [
      { id: 'peer1' },
    ]);
    const { title, description } = await question();
    expect(title).toBe(en.backup.restoreTitle);
    expect(description).toContain('Anna Muster’s device');
    expect(description).toContain('2026');
    expect(description).toContain(en.backup.restoreText);
  });

  test('this device’s own backup is not foreign', async () => {
    answers({ device: 'me', name: 'Tom', at: 1790000000 });
    expect((await question()).title).toBe(en.backup.restoreTitle);
  });

  test('any other device is foreign, and the question warns', async () => {
    answers({ device: 'stranger', name: '', at: 1790000000 }, [
      { id: 'peer1' },
    ]);
    const { title, description } = await question();
    expect(title).toBe(en.backup.foreignTitle);
    expect(description).toContain('an unnamed device');
    expect(description).toContain(en.backup.foreignText);
  });

  test('a file it can’t read gets the plain question', async () => {
    answers(null);
    expect(await question()).toMatchObject({
      title: en.backup.restoreTitle,
      description: en.backup.restoreText,
    });
  });
});
