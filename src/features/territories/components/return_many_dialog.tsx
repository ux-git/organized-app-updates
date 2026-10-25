import { useAppTranslation } from '@hooks/index';
import { useState } from 'react';
import { Button } from '@components/index';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import { Territory } from '@definition/territory';
import { assignmentIssues, toStoredDate } from '@features/territories/helpers';
import { PublisherPicker } from '@features/territories/components/holder_picker';

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
  const { t } = useAppTranslation();

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
          ? t('tr_territoryReturnTerritory', { n })
          : t('tr_territoryReturnTerritories', { n })
      }
    >
      {sharedBy && (
        <PublisherPicker
          label={t('tr_territoryReturnedBy')}
          value={returnedBy}
          onChange={setReturnedBy}
          current={sharedBy}
        />
      )}

      <DatePicker
        label={t('tr_territoryReturnedOn')}
        value={returnedOn}
        error={tooEarly || future}
        helperText={
          tooEarly
            ? t('tr_territoryCannotBeBeforeTheAssignedDate')
            : future
              ? t('tr_territoryThisDateIsInTheFuture')
              : ''
        }
        onChange={(value) => setReturnedOn(value)}
      />

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t('tr_cancel')}
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
          {t('tr_return')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReturnManyDialog;
