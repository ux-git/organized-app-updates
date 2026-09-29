import { tx } from '@services/i18n/translation';
import { doNotCallLabel } from '../helpers';
import { AssignReturn } from '../useAssignReturn';
import AssignDialog from './assign_dialog';
import ReturnDialog from './return_dialog';
import UndoSnackbar from './undo_snackbar';

const AssignReturnDialogs = ({
  actions,
  canAssign,
}: {
  actions: AssignReturn;
  // publishers only give back their own, never assign it again
  canAssign: boolean;
}) => {
  const { assignTarget, returnTarget } = actions;

  const doNotCalls = assignTarget?.doNotCalls.length ?? 0;

  return (
    <>
      {/* both dialogs mount per territory so their fields start from it */}
      {assignTarget && (
        <AssignDialog
          title={tx('Assign {{number}}', { number: assignTarget.number })}
          subtitle={`${assignTarget.name} · ${assignTarget.city}`}
          requestedBy={assignTarget.requestedBy}
          doNotCallNote={
            doNotCalls > 0
              ? tx(
                  '{{label}} in this territory. Remind the publisher to skip them.',
                  {
                    label: doNotCallLabel(
                      doNotCalls,
                      assignTarget.type === 'phone'
                    ),
                  }
                )
              : undefined
          }
          territories={actions.territories}
          onClose={actions.closeAssign}
          onAssign={(publisher, assignedOn, campaign) =>
            actions.handleAssign(
              assignTarget.id,
              publisher,
              assignedOn,
              campaign
            )
          }
        />
      )}

      {returnTarget && (
        <ReturnDialog
          territory={returnTarget}
          own={!canAssign}
          onClose={actions.closeReturn}
          onReturn={actions.handleReturn}
          onAssignAgain={canAssign ? actions.handleAssign : undefined}
        />
      )}

      <UndoSnackbar
        notice={actions.undo}
        onUndo={actions.undoLast}
        onClose={actions.closeUndo}
      />
    </>
  );
};

export default AssignReturnDialogs;
