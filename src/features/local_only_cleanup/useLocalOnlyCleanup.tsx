import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useCurrentUser } from '@hooks/index';
import { LocalOnlyCategory } from '@definition/settings';
import { localOnlyCategoriesState } from '@states/settings';
import appDb from '@db/appDb';

const useLocalOnlyCleanup = () => {
  const { isAdmin, isElder, isGroupOverseer, isLanguageGroupOverseer } =
    useCurrentUser();

  const localOnly = useAtomValue(localOnlyCategoriesState);

  // the derived list is a new array on every settings change
  const localOnlyKey = localOnly.join(',');
  const categories = useMemo(
    () => (localOnlyKey ? localOnlyKey.split(',') : []) as LocalOnlyCategory[],
    [localOnlyKey]
  );

  const canEditReports = isElder || isGroupOverseer || isLanguageGroupOverseer;

  const [leftovers, setLeftovers] = useState<LocalOnlyCategory[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // records kept only on admin devices that this device still holds, e.g.
    // after it lost its admin role or synced with an older app version
    const findLeftovers = async () => {
      if (categories.length === 0 || isAdmin) {
        setLeftovers([]);
        return;
      }

      const found: LocalOnlyCategory[] = [];

      for (const category of categories) {
        if ((await appDb[category].count()) > 0) found.push(category);
      }

      // only someone who could edit these records may hold the last copy
      if (!canEditReports) {
        for (const category of found) {
          await appDb[category].clear();
        }

        return;
      }

      if (!cancelled) setLeftovers(found);
    };

    findLeftovers();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, canEditReports, categories]);

  // the prompt returns the next time the dashboard opens
  const handleLater = () => setDismissed(true);

  const handleRemoved = () => setLeftovers([]);

  return {
    open: !dismissed && leftovers.length > 0,
    leftovers,
    handleLater,
    handleRemoved,
  };
};

export default useLocalOnlyCleanup;
