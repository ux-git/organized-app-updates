import i18next from 'i18next';

// Stands in for the main app's i18n, which loads every language on start
const i18n = i18next.createInstance();

await i18n.init({
  lng: 'eng',
  fallbackLng: 'eng',
  resources: {},
  interpolation: { escapeValue: false },
});

export default i18n;

export const refreshLocalesResources = async () => {};
