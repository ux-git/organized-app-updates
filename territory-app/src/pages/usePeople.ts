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
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }, [refresh]);

  return people;
};

export default usePeople;
