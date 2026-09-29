import { useCallback, useState } from 'react';
import { useAtom } from 'jotai';
import { territoriesState } from '@states/territories';
import { Territory } from '@definition/territory';
import { tx } from '@services/i18n/translation';
import { assignmentFromDates, parseDate } from './helpers';

const daysSince = (date: Date) =>
  Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000));

const closeOpen = (territory: Territory, end: Date) =>
  territory.assignments.map((item) =>
    item.returnedOn
      ? item
      : assignmentFromDates(
          item,
          item.publisher,
          parseDate(item.assignedOn) ?? end,
          end
        )
  );

// assigning and returning, shared by the list and a territory's own page
const useAssignReturn = () => {
  const [territories, setTerritories] = useAtom(territoriesState);

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

  const assign = (id: string, publisher: string, assignedOn?: Date) => {
    const start = assignedOn ?? new Date();

    patch(id, (territory) => ({
      status: 'in_work',
      holder: publisher,
      daysOut: daysSince(start),
      requestedBy: undefined,
      reviewNeeded: false,
      assignments: [
        ...closeOpen(territory, start),
        assignmentFromDates(
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
      ],
    }));
  };

  const giveBack = (id: string, households?: number, returnedOn?: Date) => {
    const end = returnedOn ?? new Date();

    patch(id, (territory) => ({
      status: 'available',
      holder: undefined,
      daysOut: undefined,
      daysSinceCovered: daysSince(end),
      reviewNeeded: households === undefined,
      ...(households === undefined ? {} : { households }),
      assignments: closeOpen(territory, end),
    }));
  };

  const handleAssign = (id: string, publisher: string, assignedOn?: Date) => {
    assign(id, publisher, assignedOn);
    remember(
      [id],
      tx('{{number}} assigned to {{name}}', {
        number: numberOf(id),
        name: publisher,
      })
    );
  };

  const handleReturn = (id: string, households?: number, returnedOn?: Date) => {
    giveBack(id, households, returnedOn);
    remember([id], tx('{{number}} returned', { number: numberOf(id) }));
  };

  const handleDecline = (id: string) =>
    patch(id, () => ({ requestedBy: undefined }));

  const assignMany = (ids: string[], publisher: string, assignedOn?: Date) => {
    ids.forEach((id) => assign(id, publisher, assignedOn));

    remember(
      ids,
      ids.length === 1
        ? tx('{{number}} assigned to {{name}}', {
            number: numberOf(ids[0]),
            name: publisher,
          })
        : tx('{{n}} territories assigned to {{name}}', {
            n: ids.length,
            name: publisher,
          })
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
