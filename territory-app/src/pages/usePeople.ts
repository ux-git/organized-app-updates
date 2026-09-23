import { useCallback, useEffect, useState } from 'react';
import { listen } from '../native';
import { loadPeople, Person } from '../persistence';

/** The names territories can be assigned to, kept current after a sync. */
const usePeople = () => {
  const [people, setPeople] = useState<Person[]>([]);

  const refresh = useCallback(() => {
    loadPeople()
      .then(setPeople)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const stop = listen('store-changed', refresh);
    // every load (after an edit here, an import or a sync) passes the list on
    const changed = (event: Event) =>
      setPeople((event as CustomEvent<Person[]>).detail);
    window.addEventListener('people-changed', changed);
    return () => {
      stop.then((unlisten) => unlisten());
      window.removeEventListener('people-changed', changed);
    };
  }, [refresh]);

  return people;
};

export default usePeople;
