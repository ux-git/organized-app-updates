import { useAtomValue } from 'jotai';
import SnackBar from '@components/snackbar';
import { IconUndo } from '@icons/index';
import { tx } from '@services/i18n/translation';
import { dismissUndo, undoLast, undoOfferState } from '../undo';

// rendered once by the app shell, for every page's offer
const UndoSnackbar = () => {
  const offer = useAtomValue(undoOfferState);

  return (
    <SnackBar
      open={!!offer}
      variant="message-with-button"
      messageHeader={offer?.text ?? ''}
      message=""
      actionIcon={<IconUndo />}
      actionText={tx('Undo')}
      actionClick={undoLast}
      onClose={dismissUndo}
    />
  );
};

export default UndoSnackbar;
