import { useState } from 'react';
import { Box, Stack } from '@mui/material';
import { Button, TextField } from '@components/index';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import SwitchWithLabel from '@components/switch_with_label';
import { useBreakpoints } from '@hooks/index';
import { assignmentIssues, toStoredDate } from '../helpers';
import { Territory } from '@definition/territory';
import { tx } from '@services/i18n/translation';

type ReturnDialogProps = {
  territory?: Territory;
  onClose: VoidFunction;
  onReturn: (id: string, households: number, returnedOn: Date) => void;
  onAssignAgain?: (id: string, publisher: string, assignedOn: Date) => void;
};

const ReturnDialog = ({
  territory,
  onClose,
  onReturn,
  onAssignAgain,
}: ReturnDialogProps) => {
  const { tablet600Up } = useBreakpoints();

  const [households, setHouseholds] = useState(
    territory ? String(territory.households) : ''
  );
  const [returnedOn, setReturnedOn] = useState<Date | null>(new Date());
  const [assignAgain, setAssignAgain] = useState(false);

  if (!territory) return null;

  const holder = territory.holder;

  const open = territory.assignments.find((item) => !item.returnedOn);
  const issues = returnedOn
    ? assignmentIssues({
        assignedOn: open?.assignedOn ?? '',
        returnedOn: toStoredDate(returnedOn),
      })
    : [];
  const tooEarly = issues.includes('returned_before_assigned');
  const future = issues.includes('returned_future');

  return (
    <Dialog
      onClose={onClose}
      open
      title={tx('Return {{number}}', { number: territory.number })}
      description={tx(
        'Confirm when the territory came back and the households count the publisher reported.'
      )}
    >
      <Stack
        direction={tablet600Up ? 'row' : 'column'}
        spacing="16px"
        sx={{ width: '100%' }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
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
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <TextField
            label={tx('Households')}
            type="number"
            value={households}
            onChange={(event) => setHouseholds(event.target.value)}
          />
        </Box>
      </Stack>

      {holder && onAssignAgain && (
        <SwitchWithLabel
          label={tx('Assign again to {{name}}', { name: holder })}
          helper={tx('Starts a new assignment on the same date')}
          checked={assignAgain}
          onChange={setAssignAgain}
        />
      )}

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button
          variant="main"
          disabled={tooEarly}
          onClick={() => {
            const date = returnedOn ?? new Date();

            onReturn(
              territory.id,
              Number(households) || territory.households,
              date
            );

            if (assignAgain && holder)
              onAssignAgain?.(territory.id, holder, date);

            onClose();
          }}
        >
          {assignAgain ? tx('Return and assign') : tx('Return')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReturnDialog;
