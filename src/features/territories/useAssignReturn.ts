import { useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { territoriesState } from '@states/territories';
import {
  AssignmentCard,
  AssignmentHolder,
  Territory,
  TerritoryAssignment,
} from '@definition/territory';
import { tx } from '@services/i18n/translation';
import { assignmentFromDates, parseDate } from './helpers';
import { territoryCampaignsState } from './campaigns';
import { campaignFor, campaignSnapshot } from './campaign_dates';
import { savedCard } from './card_choice';
import { isCoverage } from './coverage_rate';
import { revertAssignment } from './assignment_undo';
import { holderOf, holderText } from './group_holder';
import { offerUndo } from './undo';

// undefined leaves an assignment's campaign as it is, null clears it
type Campaign = TerritoryAssignment['campaign'] | null;

const daysSince = (date: Date) =>
  Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000));

// undefined leaves the note as it is, an empty string clears it
const closeOpen = (
  territory: Territory,
  end: Date,
  campaign?: Campaign,
  note?: string
) =>
  territory.assignments.map((item) =>
    item.returnedOn
      ? item
      : {
          ...assignmentFromDates(
            item,
            item.publisher,
            parseDate(item.assignedOn) ?? end,
            end
          ),
          ...(campaign === undefined
            ? {}
            : { campaign: campaign ?? undefined }),
          ...(note === undefined ? {} : { note: note || undefined }),
        }
  );

// assigning and returning, shared by the list and a territory's own page
const useAssignReturn = () => {
  const [territories, setTerritories] = useAtom(territoriesState);
  const campaigns = useAtomValue(territoryCampaignsState);

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

  // without a say from a dialog, the campaign running on the day applies,
  // and the card goes out the way it did last time on this device
  const assign = (
    id: string,
    holder: AssignmentHolder,
    assignedOn?: Date,
    campaign?: Campaign,
    note?: string,
    card: AssignmentCard | undefined = savedCard()
  ) => {
    const start = assignedOn ?? new Date();
    const running = campaignFor(campaigns, start);
    const filedUnder =
      campaign === undefined
        ? running && campaignSnapshot(running)
        : (campaign ?? undefined);
    const assignmentId = `ta-${Date.now()}-${id}`;

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
        ...closeOpen(territory, start),
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
    note?: string
  ) => {
    const end = returnedOn ?? new Date();

    patch(id, (territory) => {
      const open = territory.assignments.find((item) => !item.returnedOn);
      const covered = !open || isCoverage(open);

      return {
        status: 'available',
        holder: undefined,
        holderGroup: undefined,
        daysOut: undefined,
        ...(covered ? { daysSinceCovered: daysSince(end) } : {}),
        // a note is for the editor to read; the list marks it until they do
        reviewNeeded: !!note,
        ...(households === undefined ? {} : { households }),
        assignments: closeOpen(territory, end, campaign, note),
      };
    });
  };

  const assignedText = (
    id: string,
    holder: AssignmentHolder,
    flagged: boolean
  ) => {
    const values = { number: numberOf(id), name: holderText(holder) };

    return flagged
      ? tx('{{number}} assigned to {{name}} for the campaign', values)
      : tx('{{number}} assigned to {{name}}', values);
  };

  const handleAssign = (
    id: string,
    holder: AssignmentHolder,
    assignedOn?: Date,
    campaign?: Campaign,
    note?: string,
    card?: AssignmentCard
  ) => {
    const { flagged, assignmentId } = assign(
      id,
      holder,
      assignedOn,
      campaign,
      note,
      card
    );
    remember([id], assignedText(id, holder, flagged), [assignmentId]);
  };

  const handleReturn = (
    id: string,
    households?: number,
    returnedOn?: Date,
    campaign?: Campaign,
    note?: string
  ) => {
    giveBack(id, households, returnedOn, campaign, note);
    remember([id], tx('{{number}} returned', { number: numberOf(id) }));
  };

  const handleDecline = (id: string) => {
    const requestedBy = territories.find(
      (territory) => territory.id === id
    )?.requestedBy;
    if (!requestedBy) return;

    patch(id, () => ({ requestedBy: undefined }));
    offerUndo({
      text: tx('Request from {{name}} declined', { name: requestedBy }),
      revert: () => patch(id, () => ({ requestedBy })),
    });
  };

  const assignMany = (
    ids: string[],
    holder: AssignmentHolder,
    assignedOn?: Date,
    campaign?: Campaign,
    card?: AssignmentCard
  ) => {
    const results = ids.map((id) =>
      assign(id, holder, assignedOn, campaign, undefined, card)
    );
    const flagged = results.some((result) => result.flagged);
    const values = { n: ids.length, name: holderText(holder) };

    remember(
      ids,
      ids.length === 1
        ? assignedText(ids[0], holder, flagged)
        : flagged
          ? tx(
              '{{n}} territories assigned to {{name}} for the campaign',
              values
            )
          : tx('{{n}} territories assigned to {{name}}', values),
      results.map((result) => result.assignmentId)
    );
  };

  const returnMany = (ids: string[], returnedOn?: Date) => {
    ids.forEach((id) => giveBack(id, undefined, returnedOn));

    remember(
      ids,
      ids.length === 1
        ? tx('{{number}} returned', { number: numberOf(ids[0]) })
        : tx('{{n}} territories returned', { n: ids.length })
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
