import { useEffect, useState } from 'react';
import { invoke, listen, nearby } from '../native';
import { play } from '../haptics';
import { t } from '../i18n';
import { confirm } from './confirm';
import { describeItems, notify } from './sync/text';

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

/** Asks first: a backup merges into what is here, it doesn't replace it. */
export const restoreBackup = async (text: string) => {
  if (!text.trim().startsWith(BACKUP_PREFIX)) {
    notify(t('backup.notBackup'), t('backup.notBackupText'), 'error');
    return false;
  }
  const ok = await confirm({
    title: t('backup.restoreTitle'),
    description: t('backup.restoreText'),
    action: t('backup.restore'),
  });
  if (!ok) return false;
  try {
    const restored = await invoke<{
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
    return true;
  } catch (error) {
    play('error');
    notify(t('common.somethingWrong'), String(error), 'error');
    return false;
  }
};

const useBackup = () => {
  const [status, setStatus] = useState<BackupStatus | null>(null);

  useEffect(() => {
    const stop = listen<BackupStatus>('backup', setStatus);
    // asked once listening, or the answer can come before the listener
    stop.then(() => nearby('backupStatus'));
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }, []);

  return status;
};

export default useBackup;
