import { useCallback, useEffect, useState } from 'react';
import { listen } from '../native';
import { loadPeople, Person } from '../persistence';

// the last list, so a page opened again starts from it instead of empty
let known: Person[] = [];

/** The names territories can be assigned to, kept current after a sync. */
export const usePeopleList = () => {
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<Person[]>(known);

  const refresh = useCallback(() => {
    loadPeople()
      .then((next) => setPeople((known = next)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const stop = listen('store-changed', refresh);
    // every load (after an edit here, an import or a sync) passes the list on
    const changed = (event: Event) =>
      setPeople((known = (event as CustomEvent<Person[]>).detail));
    window.addEventListener('people-changed', changed);
    return () => {
      stop.then((unlisten) => unlisten());
      window.removeEventListener('people-changed', changed);
    };
  }, [refresh]);

  return { people, loading };
};

const usePeople = () => usePeopleList().people;
export default usePeople;
