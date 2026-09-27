import { tx } from '@services/i18n/translation';
import { Button } from '@components/index';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';

type TerritoryDeleteProps = {
  open: boolean;
  number: string;
  onClose: VoidFunction;
  onDelete: VoidFunction;
};

const TerritoryDelete = ({
  open,
  number,
  onClose,
  onDelete,
}: TerritoryDeleteProps) => (
  <Dialog
    onClose={onClose}
    open={open}
    title={tx('Delete territory {{number}}?', { number })}
    description={tx(
      'The territory, its addresses and its assignment history will be removed. This cannot be undone.'
    )}
  >
    <DialogActions>
      <Button variant="secondary" onClick={onClose}>
        {tx('Cancel')}
      </Button>
      <Button variant="main" color="red" onClick={onDelete}>
        {tx('Delete')}
      </Button>
    </DialogActions>
  </Dialog>
);

export default TerritoryDelete;
