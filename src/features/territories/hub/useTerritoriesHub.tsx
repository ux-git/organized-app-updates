import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useAtom, useAtomValue } from 'jotai';
import {
  territoryAccessState,
  territoryRestrictedCategoriesState,
  territoryRestrictedTypesState,
  userLocalUIDState,
} from '@states/settings';
import { useBreakpoints, useCurrentUser, useSubpane } from '@hooks/index';
import {
  territoriesShowHouseholdsState,
  territoriesState,
  territoriesWithStatusState,
  territoryLocalModeState,
  territoryOverdueMonthsState,
  territoryRecommendationsState,
} from '@states/territories';
import { applyFilters, EMPTY_FILTERS, forTab } from '../helpers';
import { currentPublisherState, territoryAssigneesState } from '../assignees';
import { territoryCampaignsState } from '../campaigns';
import { campaignsOn } from '../campaign_dates';
import { inCampaign } from '../campaign_filter';
import {
  AssignmentCard,
  TerritoryAssignment,
  TerritoryFilters,
  TerritoryStatus,
  TerritoryTab,
} from '@definition/territory';
import { tx } from '@services/i18n/translation';
import useAssignReturn from '../useAssignReturn';

const TAB_GROUPS: TerritoryTab[][] = [
  ['recommended', 'all'],
  ['mine', 'group', 'requested'],
  ['requests'],
];

const OWN_TABS = new Set<TerritoryTab>(['mine', 'group', 'requested']);

const BROWSE_TABS = new Set<TerritoryTab>(['recommended', 'all']);

const TAB_LABELS: Record<TerritoryTab, string> = {
  recommended: 'Recommended',
  all: 'All territories',
  mine: 'Assigned',
  group: 'My group',
  requested: 'Requested',
  requests: 'Requests',
};

const useTerritoriesHub = () => {
  const navigate = useNavigate();

  const { isElder, isServiceCommittee, my_group } = useCurrentUser();

  const isTerritoryEditor = isElder || isServiceCommittee;

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const territories = useAtomValue(territoriesState);
  const actions = useAssignReturn();
  const [showHouseholds, setShowHouseholds] = useAtom(
    territoriesShowHouseholdsState
  );
  const [overdueMonths, setOverdueMonths] = useAtom(
    territoryOverdueMonthsState
  );
  const access = useAtomValue(territoryAccessState);
  const localMode = useAtomValue(territoryLocalModeState);
  const restrictedCategories = useAtomValue(territoryRestrictedCategoriesState);
  const restrictedTypes = useAtomValue(territoryRestrictedTypesState);

  // the statistics open the list for one publisher's territories
  const [filters, setFilters] = useState<TerritoryFilters>(() => ({
    ...EMPTY_FILTERS,
    search: searchParams.get('search') ?? '',
  }));

  const searchFromUrl = searchParams.get('search') ?? '';
  useEffect(() => {
    setFilters((previous) => ({ ...previous, search: searchFromUrl }));
  }, [searchFromUrl]);

  const restricted = useMemo(
    () => ({ categories: restrictedCategories, types: restrictedTypes }),
    [restrictedCategories, restrictedTypes]
  );

  const recommendations = useAtomValue(territoryRecommendationsState);
  const campaigns = useAtomValue(territoryCampaignsState);
  const running = campaignsOn(campaigns, new Date())[0];

  const withStatus = useAtomValue(territoriesWithStatusState);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [isBoard, setIsBoard] = useState(false);
  const [selecting, setSelecting] = useState(false);
  useEffect(() => {
    if (checked.size > 0) setSelecting(false);
  }, [checked]);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [assignManyOpen, setAssignManyOpen] = useState(false);
  const { desktopUp } = useBreakpoints();

  // in the URL, so the device back gesture closes the filters on small screens
  const filtersPane = useSubpane('filters');
  // own territories have no filters, even with the flag left in the URL
  const filtersOpen =
    filtersPane.open && !OWN_TABS.has(searchParams.get('tab') as TerritoryTab);
  const setFiltersOpen = useCallback(
    (next: boolean) => filtersPane.setOpen(next, !desktopUp),
    [filtersPane, desktopUp]
  );

  const fromUrl = searchParams.get('tab') as TerritoryTab;

  const requested =
    fromUrl === 'requests' && !isTerritoryEditor ? 'requested' : fromUrl;

  const userUID = useAtomValue(userLocalUIDState);
  const me = useAtomValue(currentPublisherState);
  const assignees = useAtomValue(territoryAssigneesState);

  const isGroupLead = !!my_group?.group_data.members.some(
    (member) =>
      member.person_uid === userUID && (member.isOverseer || member.isAssistant)
  );

  const groupHolder = isGroupLead
    ? assignees.find((assignee) => assignee.id === my_group?.group_id)?.name
    : undefined;

  const canBrowse = isTerritoryEditor || access !== 'own';
  const canRequest = !localMode && (isTerritoryEditor || access === 'request');

  const tabGroups = TAB_GROUPS.map((ids) =>
    ids.filter(
      (id) =>
        (id !== 'group' || groupHolder) &&
        (canBrowse || !BROWSE_TABS.has(id)) &&
        (canRequest || id !== 'requested') &&
        (!localMode || id !== 'requests')
    )
  ).filter((ids) => ids.length > 0);

  const groupIndex = tabGroups.findIndex((item) => item.includes(requested));
  const group = tabGroups[Math.max(groupIndex, 0)];
  const tabId = group.includes(requested) ? requested : group[0];

  const isBrowsing = group === tabGroups[0];
  const tab = group.indexOf(tabId);

  const setTab = (next: number) => {
    searchParams.set('tab', group[next]);
    // keeps the entry's state, which tells an open pane how to close
    setSearchParams(searchParams, { replace: true, state: location.state });
  };

  const ownRequests = forTab(withStatus, 'requested', me).length;

  const tabs =
    group.length > 1
      ? group.map((id) => ({
          label:
            id === 'all' && !isTerritoryEditor
              ? tx('Available')
              : tx(TAB_LABELS[id]),
          ...(id === 'requested' && ownRequests > 0
            ? { badge: ownRequests }
            : {}),
        }))
      : [];

  const visible = useMemo(() => {
    const list = forTab(
      withStatus,
      tabId,
      me,
      isTerritoryEditor,
      groupHolder,
      restricted,
      localMode ? recommendations : undefined
    );

    // own territories have no filters, so none left over from other tabs apply
    if (OWN_TABS.has(tabId)) return list;

    const filtered = applyFilters(list, filters);

    // during a special campaign, the ones it has not reached yet come first
    return tabId === 'recommended' && running
      ? filtered.sort(
          (a, b) =>
            Number(inCampaign(a, running.id)) -
            Number(inCampaign(b, running.id))
        )
      : filtered;
  }, [
    recommendations,
    localMode,
    withStatus,
    tabId,
    me,
    filters,
    isTerritoryEditor,
    groupHolder,
    restricted,
    running,
  ]);

  const boardTerritories = useMemo(
    () => applyFilters(withStatus, filters),
    [withStatus, filters]
  );

  // a selection made in one view isn't carried, unseen, into another
  useEffect(() => {
    setChecked(new Set());
    setSelecting(false);
  }, [tabId, isBoard]);

  const byId = new Map(
    withStatus.map((territory) => [territory.id, territory])
  );
  const selected = Array.from(checked).flatMap((id) => {
    const territory = byId.get(id);
    return territory ? [territory] : [];
  });

  const handleDrop = (id: string, status: TerritoryStatus) => {
    const current = withStatus.find((territory) => territory.id === id);
    if (!current) return;

    const isOut = (value: TerritoryStatus) =>
      value === 'in_work' || value === 'overdue';

    if (isOut(current.status) && isOut(status)) return;

    if (status === 'in_work') {
      actions.openAssign(id);
      return;
    }

    if (status === 'available') actions.openReturn(id);
  };

  const toggleCheck = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleCheckMany = (ids: string[]) =>
    setChecked((prev) => {
      const everyChecked = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (everyChecked ? next.delete(id) : next.add(id)));
      return next;
    });

  const clearChecked = () => {
    setChecked(new Set());
    setSelecting(false);
  };

  const assignMany = (
    publisher: string,
    assignedOn?: Date,
    campaign?: TerritoryAssignment['campaign'] | null,
    card?: AssignmentCard
  ) => {
    const ids = selected
      .filter((territory) => territory.status === 'available')
      .map((territory) => territory.id);

    actions.assignMany(ids, publisher, assignedOn, campaign, card);

    setAssignManyOpen(false);
    clearChecked();
  };

  const returnMany = () => {
    const ids = selected
      .filter(
        (territory) =>
          territory.status === 'in_work' || territory.status === 'overdue'
      )
      .map((territory) => territory.id);

    actions.returnMany(ids);

    clearChecked();
  };

  const title = {
    recommended: isTerritoryEditor ? 'All territories' : 'Get territory',
    all: isTerritoryEditor ? 'All territories' : 'Get territory',
    mine: 'My territories',
    group: 'My territories',
    requested: 'My territories',
    requests: 'Requests',
  }[tabId];

  const handleOpen = (id: string) =>
    navigate(`/territories/${id}`, { state: { parent: title } });

  return {
    tab,
    tabId,
    isBrowsing,
    isOwnTab: OWN_TABS.has(tabId),
    isTerritoryEditor,
    canBrowse,
    canRequest,
    setTab,
    tabs,
    filters,
    setFilters,
    filtersOpen,
    setFiltersOpen,
    running,
    visible,
    boardTerritories,
    territories,
    selected,
    checked,
    toggleCheck,
    toggleCheckMany,
    clearChecked,
    assignMany,
    returnMany,
    actions,
    handleAssign: actions.handleAssign,
    handleDecline: actions.handleDecline,
    handleOpen,
    title,
    isBoard,
    setIsBoard,
    selecting,
    setSelecting,
    quickSettingsOpen,
    setQuickSettingsOpen,
    showHouseholds,
    setShowHouseholds,
    overdueMonths,
    setOverdueMonths,
    setReturnId: actions.openReturn,
    setAssignId: actions.openAssign,
    assignManyOpen,
    setAssignManyOpen,
    assignableCount: selected.filter(
      (territory) => territory.status === 'available'
    ).length,
    handleDrop,
  };
};

export default useTerritoriesHub;
