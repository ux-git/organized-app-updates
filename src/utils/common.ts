import { PersonType } from '@definition/person';
import { FormatNameOption } from '@definition/settings';
import { VisitingSpeakerType } from '@definition/visiting_speakers';

export const convertStringToBoolean = (value) => {
  switch (value) {
    case 'true':
      return true;
    case 'false':
      return false;
    default:
      return false;
  }
};

export const countUnreadNotifications = ({ announcements, language = 'E' }) => {
  let count = 0;

  for (const announcement of announcements) {
    const findTitleIndex = announcement.title.findIndex(
      (item) => item.language === language
    );
    let isRead = announcement.title[findTitleIndex].isRead;

    if (isRead) {
      const findBodyIndex = announcement.body.findIndex(
        (item) => item.language === language
      );
      isRead = announcement.body[findBodyIndex].isRead;
    }

    if (!isRead) count++;
  }

  return count;
};

export const formatCongregationInfo = (name = '', number = '') => {
  let formatted = '';

  if (name !== '' && number !== '') {
    formatted = `${name} (${number})`;
  }
  return formatted;
};

export const matchIsNumeric = (text) => {
  return !isNaN(Number(text));
};

export const buildPersonFullname = (
  lastname: string,
  firstname: string,
  option?: FormatNameOption,
  middlename: string = ''
) => {
  const buildOption = option || FormatNameOption.FIRST_LAST;

  const fName = firstname.trim();
  const mName = middlename.trim();
  const lName = lastname.trim();

  if (buildOption === FormatNameOption.FIRST_LAST) {
    return [fName, lName].filter(Boolean).join(' ');
  }

  if (buildOption === FormatNameOption.LAST_FIRST) {
    if (lName && fName) return `${lName}, ${fName}`;
    return [lName, fName].filter(Boolean).join(' ');
  }

  if (buildOption === FormatNameOption.FULL_NAME) {
    return [fName, mName, lName].filter(Boolean).join(' ');
  }

  if (buildOption === FormatNameOption.ABBREVIATED_LAST) {
    const lastNameInitials = lName
      .split(' ')
      .map((name) => (name ? name.substring(0, 1) + '.' : ''))
      .join(' ');
    // Keep middle name spelled out if it exists
    const firstMiddle = [fName, mName].filter(Boolean).join(' ');
    return [firstMiddle, lastNameInitials].filter(Boolean).join(' ');
  }

  if (buildOption === FormatNameOption.ABBREVIATED_FIRST) {
    const firstMiddle = [fName, mName].filter(Boolean).join(' ');
    const firstMiddleInitials = firstMiddle
      .split(' ')
      .map((name) => (name ? name.substring(0, 1) + '.' : ''))
      .join(' ');
    
    if (lName && firstMiddleInitials) return `${lName}, ${firstMiddleInitials}`;
    return [lName, firstMiddleInitials].filter(Boolean).join(' ');
  }

  if (buildOption === FormatNameOption.ABBREVIATED_FULL_NAME) {
    const lastNameInitials = lName
      .split(' ')
      .map((name) => (name ? name.substring(0, 1) + '.' : ''))
      .join(' ');
    const middleNameInitials = mName
      .split(' ')
      .map((name) => (name ? name.substring(0, 1) + '.' : ''))
      .join(' ');
    
    return [fName, middleNameInitials, lastNameInitials].filter(Boolean).join(' ');
  }

  if (buildOption === FormatNameOption.FIRST_MIDDLE_INITIAL_LAST) {
    const middleNameInitials = mName
      .split(' ')
      .map((name) => (name ? name.substring(0, 1) + '.' : ''))
      .join(' ');
    
    return [fName, middleNameInitials, lName].filter(Boolean).join(' ');
  }

  return [fName, lName].filter(Boolean).join(' ');
};

export const isMiddleNameVisible = (
  inAppOption?: FormatNameOption,
) => {
  const inApp = inAppOption || FormatNameOption.FIRST_LAST;

  return inApp !== FormatNameOption.FIRST_LAST && inApp !== FormatNameOption.LAST_FIRST;
};

export const generateDisplayName = (lastname: string, firstname: string, middlename: string = '') => {
  const fName = firstname.trim();
  const mName = middlename.trim();
  const lName = lastname.trim();

  if (lName.length === 0) {
    return [fName, mName].filter(Boolean).join(' ');
  }

  if (fName.length === 0 && mName.length === 0) {
    return lName;
  }

  const lastNameInitials = lName
    .split(' ')
    .map((name) => (name ? name.substring(0, 1) + '.' : ''))
    .join(' ');

  const firstMiddle = [fName, mName].filter(Boolean).join(' ');
  return [firstMiddle, lastNameInitials].filter(Boolean).join(' ');
};

export const localStorageGetItem = (key: string) => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  return localStorage.getItem(key);
};

export const delay = async (time: number) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

export const updateObject = <T extends object>(oldObj: T, newObj: T): T => {
  const arrayKeys = Object.keys(newObj).filter(
    (key) => newObj[key] !== null && Array.isArray(newObj[key])
  );

  const lockKeys = ['type', 'id', 'talk_number'];

  for (const key of arrayKeys) {
    if (!oldObj[key]) {
      oldObj[key] = newObj[key];
      continue;
    }

    if (!Array.isArray(oldObj[key])) {
      oldObj[key] = newObj[key];
      continue;
    }

    for (const remoteValue of newObj[key]) {
      if (typeof remoteValue !== 'object') {
        continue;
      }

      for (const lockKey of lockKeys) {
        if (lockKey in remoteValue) {
          const localValue = oldObj[key].find(
            (r) => r[lockKey] === remoteValue[lockKey]
          );

          if (!localValue) {
            oldObj[key].push(remoteValue);
          } else {
            if ('updatedAt' in localValue) {
              if (remoteValue.updatedAt > localValue.updatedAt) {
                Object.assign(localValue, remoteValue);
              }
            }

            if (!('updatedAt' in localValue)) {
              updateObject(localValue, remoteValue);
            }
          }

          break;
        }
      }
    }
  }

  const objectKeys = Object.keys(newObj).filter(
    (key) =>
      newObj[key] !== null &&
      !Array.isArray(newObj[key]) &&
      typeof newObj[key] === 'object'
  );

  for (const key of objectKeys) {
    if (oldObj[key]) {
      if (!('updatedAt' in newObj[key])) {
        updateObject(oldObj[key], newObj[key]);
      } else {
        if (newObj[key].updatedAt > oldObj[key].updatedAt) {
          oldObj[key] = newObj[key];
        }
      }
    } else {
      oldObj[key] = newObj[key];
    }
  }

  const primitiveKeys = Object.keys(newObj).filter(
    (key) => typeof newObj[key] !== 'object'
  );
  for (const key of primitiveKeys) {
    if (newObj[key] && newObj[key] !== null && newObj[key] !== '') {
      oldObj[key] = newObj[key];
    }
  }

  return oldObj;
};

export const personGetDisplayName = (
  option: PersonType,
  displayNameEnabled: boolean,
  fullnameOption: FormatNameOption
) => {
  let result: string;

  if (displayNameEnabled) {
    result = option.person_data.person_display_name.value;
  }

  if (result?.length === 0 || !displayNameEnabled) {
    result = buildPersonFullname(
      option.person_data.person_lastname.value,
      option.person_data.person_firstname.value,
      fullnameOption,
      option.person_data.person_middlename?.value
    );
  }

  return result;
};

export const speakerGetDisplayName = (
  speaker: VisitingSpeakerType,
  displayNameEnabled: boolean,
  fullnameOption: FormatNameOption
) => {
  let result: string;

  if (displayNameEnabled) {
    result = speaker.speaker_data.person_display_name.value;
  }

  if (result?.length === 0 || !displayNameEnabled) {
    result = buildPersonFullname(
      speaker.speaker_data.person_lastname.value,
      speaker.speaker_data.person_firstname.value,
      fullnameOption,
      speaker.speaker_data.person_middlename?.value
    );
  }

  return result;
};

export const createNumbersArray = (length: number) => {
  return Array.from({ length }, (_, i) => i + 1);
};

export const styledRemoveProps = (prop: PropertyKey, userProp: string[]) =>
  !userProp.includes(String(prop));

export const copyToClipboard = async (value: string) => {
  await navigator.clipboard.writeText(value);
};

export const getRandomArrayItem = <T>(array: T[]) => {
  return array[Math.floor(Math.random() * array.length)];
};

export const debounce = <T extends (...args: unknown[]) => void>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
};

export const getRandomNumber = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const getCSSPropertyValue = (key: string) => {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(key)
    .trim();
};

export const updatedAtOverride = <T extends object>(object: T): T => {
  const objectKeys = Object.keys(object);

  for (const key of objectKeys) {
    if (key === 'updatedAt') {
      object[key] = new Date().toISOString();
    }

    if (object[key] && typeof object[key] === 'object') {
      updatedAtOverride(object[key]);
    }
  }

  return object;
};
