import { useEffect, useState } from 'react';
import i18n from '@services/i18n/index';
import { store } from '@states/index';
import { invoke, listen, nearby } from '../native';
import { adoptProfile, profileToAdopt } from '../persistence';
import { myIdState } from '../profiles';
import { play } from '../haptics';
import { t } from '../i18n';
import { confirm } from './confirm';
import { describeItems, notify } from './sync/text';
import type { Peer } from './useNearby';

export type BackupFrequency = 'off' | 'daily' | 'weekly' | 'monthly';

/** What Backups.kt and Backups.swift say; times in ms. */
export type BackupStatus = {
  frequency: BackupFrequency;
  hour: number;
  minute: number;
  folder: string | null;
  folderOk: boolean;
  last: { at: number; size: number; name: string; folder: string } | null;
  error: 'folder' | 'write' | 'export' | null;
  next: number | null;
  running: boolean;
  /** When the last backup, made or failed, ended. */
  ended: number;
  /** iOS picks the moment itself. */
  approximate?: boolean;
};

export const BACKUP_PREFIX = 'OTA1:';

const pad = (n: number) => String(n).padStart(2, '0');

/** Territories-backup-2026-09-27-0200.territories */
export const backupName = (date = new Date()) =>
  `Territories-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}-${pad(date.getHours())}${pad(date.getMinutes())}.territories`;

type BackupOrigin = { device: string; name: string; at: number };

const originText = ({ name, at }: BackupOrigin) => {
  const locale = i18n.language === 'deu' ? 'de' : 'en';
  const date = new Date(at * 1000).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return name
    ? t('backup.madeBy', { name, date })
    : t('backup.madeUnnamed', { date });
};

/** Asks first: a backup merges into what is here, it doesn't replace it. */
export const restoreBackup = async (text: string) => {
  if (!text.trim().startsWith(BACKUP_PREFIX)) {
    notify(t('backup.notBackup'), t('backup.notBackupText'), 'error');
    return false;
  }
  // a damaged file has none, and the plain question is asked
  const origin = await invoke<BackupOrigin>('backup_info', { text }).catch(
    () => undefined
  );
  const peers = await invoke<Peer[]>('peers').catch(() => []);
  // an old device of one's own is foreign too, the text says so
  const foreign =
    !!origin &&
    origin.device !== store.get(myIdState) &&
    !peers.some((peer) => peer.id === origin.device);
  const ok = await confirm({
    title: foreign ? t('backup.foreignTitle') : t('backup.restoreTitle'),
    description: [
      origin && originText(origin),
      foreign ? t('backup.foreignText') : t('backup.restoreText'),
    ]
      .filter(Boolean)
      .join(' '),
    action: t('backup.restore'),
  });
  if (!ok) return false;
  try {
    const restored = await invoke<{
      name: string;
      device: string;
      received: number;
      items: Record<string, number>;
    }>('backup_restore', { text });
    play('synced');
    notify(
      t('backup.restored'),
      restored.received
        ? t('backup.restoredText', { items: describeItems(restored.items) })
        : t('backup.restoredNothing')
    );
    const old = await profileToAdopt(restored.device);
    if (
      old &&
      (await confirm({
        title: t('backup.adoptTitle'),
        description: t('backup.adoptText', { name: restored.name }),
        action: t('backup.adopt'),
      }))
    ) {
      await adoptProfile(old);
    }
    return true;
  } catch (error) {
    play('error');
    console.error('backup: restore failed', error);
    notify(t('common.somethingWrong'), t('backup.restoreFailed'), 'error');
    return false;
  }
};

// the last status, so a page opened again starts from it instead of empty
let known: BackupStatus | null = null;

const useBackup = () => {
  const [status, setStatus] = useState<BackupStatus | null>(known);

  useEffect(() => {
    const stop = listen<BackupStatus>('backup', (next) =>
      setStatus((known = next))
    );
    // asked once listening, or the answer can come before the listener
    stop.then(() => nearby('backupStatus'));
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }, []);

  return status;
};

export default useBackup;
