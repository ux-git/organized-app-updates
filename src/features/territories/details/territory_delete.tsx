import { tx } from '@services/i18n/translation';
import { Button } from '@components/index';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';

type TerritoryDeleteProps = {
  open: boolean;
  number: string;
  // whoever has it out now
  holder?: string;
  onClose: VoidFunction;
  onDelete: VoidFunction;
};

const TerritoryDelete = ({
  open,
  number,
  holder,
  onClose,
  onDelete,
}: TerritoryDeleteProps) => (
  <Dialog
    onClose={onClose}
    open={open}
    title={tx('Delete territory {{number}}?', { number })}
    description={
      holder
        ? tx(
            '{{name}} has this territory now. The open assignment, the assignment history and the do-not-calls are removed with it. You can undo it right after.',
            { name: holder }
          )
        : tx(
            'The territory, its addresses and its assignment history will be removed. You can undo it right after.'
          )
    }
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
