import { tx } from '@services/i18n/translation';
import { AssignReturn } from '../useAssignReturn';
import AssignDialog from './assign_dialog';
import ReturnDialog from './return_dialog';

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
          doNotCalls={doNotCalls}
          territory={assignTarget}
          onClose={actions.closeAssign}
          onAssign={(publisher, assignedOn, campaign, card) =>
            actions.handleAssign(
              assignTarget.id,
              publisher,
              assignedOn,
              campaign,
              undefined,
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
    </>
  );
};

export default AssignReturnDialogs;
