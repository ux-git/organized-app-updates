import useTerritoryAccess from '@features/territories/useTerritoryAccess';
import { territoryPermissions } from '@services/app/territory_access';
import { territoryReturnDateError } from '@utils/territory_assignments';
import { assignmentNoteUpdate } from '@features/territories/notes';
import { useAppTranslation } from '@hooks/index';
import { useState } from 'react';
import { useAtom } from 'jotai';
import { territoriesState } from '@states/territories';
import {
  AssignmentCard,
  AssignmentHolder,
  Territory,
  TerritoryAssignment,
} from '@definition/territory';
import { assignmentFromDates, parseDate } from '@features/territories/helpers';
import { savedCard } from '@features/territories/card_choice';
import { isCoverage } from '@features/territories/coverage_rate';
import { revertAssignment } from '@features/territories/assignment_undo';
import { holderOf, holderText } from '@features/territories/group_holder';
import { offerUndo } from '@features/territories/undo';

// undefined leaves an assignment's campaign as it is, null clears it
type Campaign = TerritoryAssignment['campaign'] | null;

const daysSince = (date: Date) =>
  Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000));

// undefined leaves the note and the publisher as they are, an empty note
// clears it
const closeOpen = (
  territory: Territory,
  end: Date,
  campaign?: Campaign,
  note?: string,
  publisher?: string,
  completed?: boolean
) =>
  territory.assignments.map((item) =>
    item.returnedOn
      ? item
      : {
          ...assignmentFromDates(
            item,
            publisher ?? item.publisher,
            parseDate(item.assignedOn) ?? end,
            end
          ),
          ...(campaign === undefined
            ? {}
            : { campaign: campaign ?? undefined }),
          ...(completed === undefined ? {} : { completed }),
          ...assignmentNoteUpdate(note),
        }
  );

// assigning and returning, shared by the list and a territory's own page
const useAssignReturn = () => {
  const { t } = useAppTranslation();
  const context = useTerritoryAccess();

  const [territories, setTerritories] = useAtom(territoriesState);

  const [assignId, setAssignId] = useState<string | undefined>();
  const [returnId, setReturnId] = useState<string | undefined>();

  const patch = (
    id: string,
    changes: (territory: Territory) => Partial<Territory>
  ) =>
    setTerritories((prev) =>
      prev.map((territory) =>
        territory.id === id
          ? { ...territory, ...changes(territory) }
          : territory
      )
    );

  // the territories as they were, and the assignments it added
  const remember = (ids: string[], text: string, added: string[] = []) => {
    if (ids.length === 0) return;

    const before = new Map(
      territories
        .filter((territory) => ids.includes(territory.id))
        .map((item) => [item.id, item])
    );
    offerUndo({
      text,
      revert: () =>
        setTerritories((prev) =>
          prev.map((item) => {
            const old = before.get(item.id);
            return old ? revertAssignment(item, old, added) : item;
          })
        ),
    });
  };

  const numberOf = (id: string) =>
    territories.find((territory) => territory.id === id)?.number ?? '';

  // Campaign work is explicit; quick assignment defaults to regular work.
  const assign = (
    id: string,
    holder: AssignmentHolder,
    assignedOn?: Date,
    campaign?: Campaign,
    note?: string,
    card: AssignmentCard | undefined = savedCard()
  ) => {
    const start = assignedOn ?? new Date();
    if (
      !context.editor ||
      !holder.publisher.trim() ||
      !Number.isFinite(start.getTime())
    )
      return { flagged: false, assignmentId: '' };
    const filedUnder = campaign ?? undefined;
    const assignmentId = crypto.randomUUID();

    // handing it out is not reading its last note: the mark stays until an
    // editor opens the territory, also when the holder takes it straight back
    const { publisher, group } = holderOf(holder);

    patch(id, (territory) => ({
      status: 'in_work',
      holder: publisher,
      holderGroup: group,
      daysOut: daysSince(start),
      requestedBy: undefined,
      assignments: [
        ...closeOpen(territory, start, undefined, undefined, undefined, false),
        {
          ...assignmentFromDates(
            {
              id: assignmentId,
              ...holderOf(holder),
              assignedOn: '',
              serviceYear: 0,
              months: 0,
              startMonth: 0,
              endMonth: 0,
            },
            publisher,
            start,
            null
          ),
          ...(filedUnder ? { campaign: filedUnder } : {}),
          ...(note ? { note } : {}),
          card,
        },
      ],
    }));

    return { flagged: !!filedUnder, assignmentId };
  };

  const giveBack = (
    id: string,
    households?: number,
    returnedOn?: Date,
    campaign?: Campaign,
    note?: string,
    publisher?: string,
    completed?: boolean
  ) => {
    const end = returnedOn ?? new Date();
    let changed = false;

    patch(id, (territory) => {
      if (
        !territoryPermissions(territory, context).return ||
        territoryReturnDateError(territory.assignments, end) ||
        (households !== undefined &&
          (!Number.isSafeInteger(households) || households < 0))
      )
        return {};
      if (!context.editor) {
        campaign = undefined;
        publisher = undefined;
      }
      const open = territory.assignments.find((item) => !item.returnedOn);
      const covered =
        !!open &&
        isCoverage({
          ...open,
          completed: completed ?? open.completed,
          campaign:
            campaign === undefined ? open.campaign : (campaign ?? undefined),
        });

      changed = true;
      return {
        status: 'available',
        holder: undefined,
        holderGroup: undefined,
        daysOut: undefined,
        ...(covered ? { daysSinceCovered: daysSince(end) } : {}),
        // a note is for the editor to read; the list marks it until they do
        reviewNeeded: territory.reviewNeeded || !!note,
        ...(households === undefined ? {} : { households }),
        assignments: closeOpen(
          territory,
          end,
          campaign,
          note,
          publisher,
          completed
        ),
      };
    });
    return changed;
  };

  const assignedText = (
    id: string,
    holder: AssignmentHolder,
    flagged: boolean
  ) => {
    const values = { number: numberOf(id), name: holderText(holder) };

    return flagged
      ? t('tr_territoryAssignedToForTheCampaign', values)
      : t('tr_territoryAssignedConfirmation', values);
  };

  const handleAssign = (
    id: string,
    holder: AssignmentHolder,
    assignedOn?: Date,
    campaign?: Campaign,
    note?: string,
    card?: AssignmentCard
  ) => {
    if (!context.editor) return;
    const { flagged, assignmentId } = assign(
      id,
      holder,
      assignedOn,
      campaign,
      note,
      card
    );
    if (assignmentId)
      remember([id], assignedText(id, holder, flagged), [assignmentId]);
  };

  const handleReturn = (
    id: string,
    households?: number,
    returnedOn?: Date,
    campaign?: Campaign,
    note?: string,
    publisher?: string,
    completed?: boolean
  ) => {
    if (
      giveBack(id, households, returnedOn, campaign, note, publisher, completed)
    )
      remember([id], t('tr_territoryReturned', { number: numberOf(id) }));
  };

  const handleDecline = (id: string) => {
    if (!context.editor) return;
    const requestedBy = territories.find(
      (territory) => territory.id === id
    )?.requestedBy;
    if (!requestedBy) return;

    patch(id, () => ({ requestedBy: undefined }));
    offerUndo({
      text: t('tr_territoryRequestFromDeclined', { name: requestedBy }),
      revert: () => patch(id, () => ({ requestedBy })),
    });
  };

  const assignMany = (
    ids: string[],
    holder: AssignmentHolder,
    assignedOn?: Date,
    campaign?: Campaign,
    card?: AssignmentCard,
    note?: string
  ) => {
    if (!context.editor) return;
    const results = ids.map((id) =>
      assign(id, holder, assignedOn, campaign, note, card)
    );
    const flagged = results.some((result) => result.flagged);
    const values = { n: ids.length, name: holderText(holder) };

    remember(
      ids,
      ids.length === 1
        ? assignedText(ids[0], holder, flagged)
        : flagged
          ? t('tr_territoryTerritoriesAssignedToForTheCampaign', values)
          : t('tr_territoryTerritoriesAssignedTo', values),
      results.map((result) => result.assignmentId)
    );
  };

  const returnMany = (ids: string[], returnedOn?: Date, publisher?: string) => {
    const returned = ids.filter((id) =>
      giveBack(id, undefined, returnedOn, undefined, undefined, publisher)
    );

    remember(
      returned,
      returned.length === 1
        ? t('tr_territoryReturned', { number: numberOf(returned[0]) })
        : t('tr_territoryTerritoriesReturned', { n: returned.length })
    );
  };

  return {
    territories,
    openAssign: setAssignId,
    closeAssign: () => setAssignId(undefined),
    assignTarget: territories.find((territory) => territory.id === assignId),
    openReturn: setReturnId,
    closeReturn: () => setReturnId(undefined),
    returnTarget: territories.find((territory) => territory.id === returnId),
    handleAssign,
    handleReturn,
    handleDecline,
    assignMany,
    returnMany,
  };
};

export type AssignReturn = ReturnType<typeof useAssignReturn>;

export default useAssignReturn;
