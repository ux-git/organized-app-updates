export const WELCOME_KEY = 'territories-welcomed';

export const welcomed = () => {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return true;
  }
};
