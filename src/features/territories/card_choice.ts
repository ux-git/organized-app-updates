import { localStorageGetItem } from '@utils/common';
import { AssignmentCard } from '@definition/territory';

// per device, like the map provider: whoever prints the cards keeps printing
const CARD_KEY = 'territory_assignment_card';

export const savedCard = (): AssignmentCard =>
  localStorageGetItem(CARD_KEY) === 'printed' ? 'printed' : 'digital';

export const rememberCard = (card: AssignmentCard) =>
  localStorage.setItem(CARD_KEY, card);
