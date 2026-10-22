import { ReactNode } from 'react';
import {
  IconAssignment,
  IconCancelCicle,
  IconMap,
  IconPerson,
  IconSettings,
} from '@icons/index';
import { Kind, kindTint } from './waitingKinds';

const KindIcon = ({ kind, size = 20 }: { kind: Kind; size?: number }) => {
  const props = { width: size, height: size, color: kindTint[kind] };
  const icons: Record<Kind, ReactNode> = {
    territories: <IconMap {...props} />,
    assignments: <IconAssignment {...props} />,
    do_not_calls: <IconCancelCicle {...props} />,
    people: <IconPerson {...props} />,
    settings: <IconSettings {...props} />,
  };
  return icons[kind];
};

export default KindIcon;
