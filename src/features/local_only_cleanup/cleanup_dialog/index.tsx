import { useAppTranslation } from '@hooks/index';
import { LocalOnlyCategory } from '@definition/settings';
import useCleanupDialog from './useCleanupDialog';
import Button from '@components/button';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';

type CleanupDialogProps = {
  leftovers: LocalOnlyCategory[];
  onLater: VoidFunction;
  onRemoved: VoidFunction;
};

const CleanupDialog = ({
  leftovers,
  onLater,
  onRemoved,
}: CleanupDialogProps) => {
  const { t } = useAppTranslation();

  const { exported, isProcessing, handleExport, handleRemove } =
    useCleanupDialog(leftovers, onRemoved);

  return (
    <Dialog
      open={true}
      onClose={onLater}
      title={t('tr_localOnlyCleanup')}
      description={t('tr_localOnlyCleanupDesc')}
    >
      <DialogActions>
        <Button variant="secondary" onClick={onLater}>
          {t('tr_localOnlyCleanupLater')}
        </Button>
        {exported ? (
          <Button variant="main" color="red" onClick={handleRemove}>
            {t('tr_localOnlyCleanupRemove')}
          </Button>
        ) : (
          <Button variant="main" disabled={isProcessing} onClick={handleExport}>
            {t('tr_localOnlyCleanupExport')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default CleanupDialog;
