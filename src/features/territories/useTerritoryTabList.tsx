import { useCallback } from 'react';
import { useAtomValue } from 'jotai';
import type { TerritoryTab } from '@definition/territory';
import { forTab } from '@features/territories/tabs';
import useTerritoryAccess from '@features/territories/useTerritoryAccess';
import {
  territoriesWithStatusState,
  territoryRecommendationsState,
} from '@states/territories';

// Dashboard badges and the list must use the same current assignments and identity.
const useTerritoryTabList = () => {
  const context = useTerritoryAccess();
  const territories = useAtomValue(territoriesWithStatusState);
  const recommendations = useAtomValue(territoryRecommendationsState);
  const selectTab = useCallback(
    (tab: TerritoryTab) =>
      forTab(
        territories,
        tab,
        context.publisher,
        context.editor,
        context.groupHolder,
        context.restricted,
        { recommendations, identity: context }
      ),
    [territories, context, recommendations]
  );

  return { context, territories, selectTab };
};

export default useTerritoryTabList;
