import { useCallback, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { territoriesState } from '@states/territories';
import {
  AssignmentCard,
  Territory,
  TerritoryAssignment,
} from '@definition/territory';
import { tx } from '@services/i18n/translation';
import { assignmentFromDates, parseDate } from './helpers';
import { territoryCampaignsState } from './campaigns';
import { campaignFor, campaignSnapshot } from './campaign_dates';
import { savedCard } from './card_choice';
import { isCoverage } from './coverage_rate';

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

  // the last assign or return, and the territories as they were before it
  const [undo, setUndo] = useState<{
    key: number;
    header: string;
    before: Territory[];
  }>();

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

  const remember = (ids: string[], header: string) =>
    ids.length > 0 &&
    setUndo({
      key: Date.now(),
      header,
      before: territories.filter((territory) => ids.includes(territory.id)),
    });

  const undoLast = () => {
    if (!undo) return;

    const before = new Map(undo.before.map((item) => [item.id, item]));
    setTerritories((prev) => prev.map((item) => before.get(item.id) ?? item));
    setUndo(undefined);
  };

  const closeUndo = useCallback(() => setUndo(undefined), []);

  const numberOf = (id: string) =>
    territories.find((territory) => territory.id === id)?.number ?? '';

  // without a say from a dialog, the campaign running on the day applies,
  // and the card goes out the way it did last time on this device
  const assign = (
    id: string,
    publisher: string,
    assignedOn?: Date,
    campaign?: Campaign,
    note?: string,
    card: AssignmentCard = savedCard()
  ) => {
    const start = assignedOn ?? new Date();
    const running = campaignFor(campaigns, start);
    const filedUnder =
      campaign === undefined
        ? running && campaignSnapshot(running)
        : (campaign ?? undefined);

    patch(id, (territory) => ({
      status: 'in_work',
      holder: publisher,
      daysOut: daysSince(start),
      requestedBy: undefined,
      reviewNeeded: false,
      assignments: [
        ...closeOpen(territory, start),
        {
          ...assignmentFromDates(
            {
              id: `ta-${Date.now()}-${id}`,
              publisher,
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

    return !!filedUnder;
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
      // a campaign-only return leaves the last coverage where it was
      const open = territory.assignments.find((item) => !item.returnedOn);
      const filedUnder =
        campaign === undefined ? open?.campaign : (campaign ?? undefined);
      const covered = !open || isCoverage({ campaign: filedUnder });

      return {
        status: 'available',
        holder: undefined,
        daysOut: undefined,
        ...(covered ? { daysSinceCovered: daysSince(end) } : {}),
        // a note is for the editor to read; the list marks it until they do
        reviewNeeded: households === undefined || !!note,
        ...(households === undefined ? {} : { households }),
        assignments: closeOpen(territory, end, campaign, note),
      };
    });
  };

  const assignedText = (id: string, publisher: string, flagged: boolean) => {
    const values = { number: numberOf(id), name: publisher };

    return flagged
      ? tx('{{number}} assigned to {{name}} for the campaign', values)
      : tx('{{number}} assigned to {{name}}', values);
  };

  const handleAssign = (
    id: string,
    publisher: string,
    assignedOn?: Date,
    campaign?: Campaign,
    note?: string,
    card?: AssignmentCard
  ) => {
    const flagged = assign(id, publisher, assignedOn, campaign, note, card);
    remember([id], assignedText(id, publisher, flagged));
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

  const handleDecline = (id: string) =>
    patch(id, () => ({ requestedBy: undefined }));

  const assignMany = (
    ids: string[],
    publisher: string,
    assignedOn?: Date,
    campaign?: Campaign,
    card?: AssignmentCard
  ) => {
    const flagged = ids
      .map((id) => assign(id, publisher, assignedOn, campaign, undefined, card))
      .some(Boolean);
    const values = { n: ids.length, name: publisher };

    remember(
      ids,
      ids.length === 1
        ? assignedText(ids[0], publisher, flagged)
        : flagged
          ? tx(
              '{{n}} territories assigned to {{name}} for the campaign',
              values
            )
          : tx('{{n}} territories assigned to {{name}}', values)
    );
  };

  const returnMany = (ids: string[]) => {
    ids.forEach((id) => giveBack(id));

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
    undo,
    undoLast,
    closeUndo,
  };
};

export type AssignReturn = ReturnType<typeof useAssignReturn>;

export default useAssignReturn;
