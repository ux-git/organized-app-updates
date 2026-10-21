import { useState } from 'react';
import { Button } from '@components/index';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import { Territory } from '@definition/territory';
import { tx } from '@services/i18n/translation';
import { assignmentIssues, toStoredDate } from '../helpers';
import { PublisherPicker } from './holder_picker';

type ReturnManyDialogProps = {
  territories: Territory[];
  onClose: VoidFunction;
  onReturn: (returnedOn: Date, publisher?: string) => void;
};

const ReturnManyDialog = ({
  territories,
  onClose,
  onReturn,
}: ReturnManyDialogProps) => {
  const opens = territories.flatMap((territory) =>
    territory.assignments.filter((item) => !item.returnedOn)
  );

  // only one person to check when they all hold the same
  const heldBy = new Set(opens.map((item) => item.publisher));
  const sharedBy = heldBy.size === 1 ? [...heldBy][0] : '';

  const [returnedOn, setReturnedOn] = useState<Date | null>(new Date());
  const [returnedBy, setReturnedBy] = useState(sharedBy);

  const issues = returnedOn
    ? opens.flatMap((item) =>
        assignmentIssues({
          assignedOn: item.assignedOn,
          returnedOn: toStoredDate(returnedOn),
        })
      )
    : [];
  const tooEarly = issues.includes('returned_before_assigned');
  const future = issues.includes('returned_future');

  const n = territories.length;

  return (
    <Dialog
      onClose={onClose}
      open
      title={
        n === 1
          ? tx('Return {{n}} territory', { n })
          : tx('Return {{n}} territories', { n })
      }
    >
      {sharedBy && (
        <PublisherPicker
          label={tx('Returned by')}
          value={returnedBy}
          onChange={setReturnedBy}
          current={sharedBy}
        />
      )}

      <DatePicker
        label={tx('Returned on')}
        value={returnedOn}
        error={tooEarly || future}
        helperText={
          tooEarly
            ? tx('Cannot be before the assigned date')
            : future
              ? tx('This date is in the future')
              : ''
        }
        onChange={(value) => setReturnedOn(value)}
      />

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button
          variant="main"
          disabled={!returnedOn || tooEarly || future}
          onClick={() => {
            if (!returnedOn || tooEarly || future) return;

            onReturn(
              returnedOn,
              sharedBy && returnedBy && returnedBy !== sharedBy
                ? returnedBy
                : undefined
            );
          }}
        >
          {tx('Return')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReturnManyDialog;
