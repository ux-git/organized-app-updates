import { play } from '../../haptics';
import { invoke } from '../../native';
import { t } from '../../i18n';
import { CARD_PREFIX, describeItems, notify } from './text';
import { BACKUP_PREFIX, restoreBackup } from '../useBackup';

// ---- what a scanned QR code or an opened file contains ----

/** What the core hands over instead of a file too large to open. */
const TOO_LARGE = 'OTX1:too-large';

/**
 * A transfer or a backup. A scanned pairing code goes to the QR pairing
 * dialog before it gets here; only one in an opened file ends up here.
 */
export const receive = async (text: string) => {
  try {
    if (text.startsWith(CARD_PREFIX)) {
      play('error');
      notify(t('receive.cardOutside'), t('receive.cardOutsideText'), 'error');
    } else if (text === TOO_LARGE) {
      play('error');
      notify(t('receive.tooLarge'), t('receive.tooLargeText'), 'error');
    } else if (text.startsWith('OTB1:')) {
      const imported = await invoke<{
        name: string;
        received: number;
        items: Record<string, number>;
      }>('import_bundle', { text });
      play('synced');
      notify(
        t('receive.from', { name: imported.name }),
        imported.received
          ? t('receive.got', { items: describeItems(imported.items) })
          : t('receive.nothing')
      );
    } else if (text.startsWith(BACKUP_PREFIX)) {
      await restoreBackup(text);
    } else {
      notify(t('receive.unknown'), t('receive.unknownText'), 'error');
    }
  } catch (error) {
    play('error');
    notify(t('common.somethingWrong'), String(error), 'error');
  }
};
