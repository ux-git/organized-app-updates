import { useAppTranslation } from '@hooks/index';
import { AssignReturn } from '@features/territories/useAssignReturn';
import AssignDialog from '@features/territories/components/assign_dialog';
import ReturnDialog from '@features/territories/components/return_dialog';

const AssignReturnDialogs = ({
  actions,
  canAssign,
}: {
  actions: AssignReturn;
  // publishers only give back their own; they may take it straight back,
  // but never file it under a campaign
  canAssign: boolean;
}) => {
  const { t } = useAppTranslation();

  const { assignTarget, returnTarget } = actions;

  const doNotCalls = assignTarget?.doNotCalls.length ?? 0;

  return (
    <>
      {/* both dialogs mount per territory so their fields start from it */}
      {canAssign && assignTarget && (
        <AssignDialog
          title={t('tr_territoryAssign', { number: assignTarget.number })}
          subtitle={`${assignTarget.name} · ${assignTarget.city}`}
          requestedBy={assignTarget.requestedBy}
          doNotCalls={doNotCalls}
          territory={assignTarget}
          onClose={actions.closeAssign}
          onAssign={(holder, assignedOn, campaign, card, note) =>
            actions.handleAssign(
              assignTarget.id,
              holder,
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
          onAssignAgain={canAssign ? actions.handleAssign : undefined}
        />
      )}
    </>
  );
};

export default AssignReturnDialogs;
