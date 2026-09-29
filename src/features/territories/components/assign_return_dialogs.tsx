import { tx } from '@services/i18n/translation';
import { AssignReturn } from '../useAssignReturn';
import AssignDialog from './assign_dialog';
import ReturnDialog from './return_dialog';
import UndoSnackbar from './undo_snackbar';

const AssignReturnDialogs = ({
  actions,
  canAssign,
}: {
  actions: AssignReturn;
  // publishers only give back their own; they may take it straight back,
  // but never file it under a campaign
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
              ? tx('Do not call: {{n}}', { n: doNotCalls })
              : undefined
          }
          territory={assignTarget}
          onClose={actions.closeAssign}
          onAssign={(publisher, assignedOn, campaign, card, note) =>
            actions.handleAssign(
              assignTarget.id,
              publisher,
              assignedOn,
              campaign,
              note,
              card
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
          onAssignAgain={actions.handleAssign}
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
