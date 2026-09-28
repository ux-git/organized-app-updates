import { useEffect } from 'react';
import { Portal } from '@mui/material';
import SnackBar from '@components/snackbar';
import { IconUndo } from '@icons/index';
import { tx } from '@services/i18n/translation';

const SHOWN_FOR = 6000;

const UndoSnackbar = ({
  notice,
  onUndo,
  onClose,
}: {
  // a new key starts the time again
  notice?: { key: number; header: string };
  onUndo: VoidFunction;
  onClose: VoidFunction;
}) => {
  useEffect(() => {
    if (!notice) return;

    const timer = setTimeout(onClose, SHOWN_FOR);
    return () => clearTimeout(timer);
  }, [notice, onClose]);

  // the page's slide-in keeps a transform, which would pin a fixed bar to the page
  return (
    <Portal>
      <SnackBar
        open={!!notice}
        variant="message-with-button"
        messageHeader={notice?.header ?? ''}
        message=""
        actionIcon={<IconUndo />}
        actionText={tx('Undo')}
        actionClick={onUndo}
        onClose={onClose}
      />
    </Portal>
  );
};

export default UndoSnackbar;
