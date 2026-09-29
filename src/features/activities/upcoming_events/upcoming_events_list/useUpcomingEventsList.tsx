import { useMemo } from 'react';
import { UpcomingEventsListProps } from './index.types';
import { groupEventsByYear } from '@services/app/upcoming_events';
import useCurrentUser from '@hooks/useCurrentUser';

const useUpcomingEventsList = ({ data }: UpcomingEventsListProps) => {
  const { isUpcomingEventsEditor } = useCurrentUser();

  const eventsSortedByYear = useMemo(() => groupEventsByYear(data), [data]);

  return { eventsSortedByYear, isUpcomingEventsEditor };
};

export default useUpcomingEventsList;
