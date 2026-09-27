import i18n, { refreshLocalesResources } from '@services/i18n/index';
import { determineAppLocale } from '@services/app';
import { appLangState, appLocaleState } from '@states/app';
import { settingsState } from '@states/settings';
import { store } from '@states/index';
import en from './locales/en.json';
import de from './locales/de.json';
import text from './locales/text.de.json';

// this app's own texts, beside the main app's (managed on Crowdin)
const NS = 'territory';

i18n.addResourceBundle('eng', NS, en);
i18n.addResourceBundle('deu', NS, de);
// the main app's texts that read differently here, or aren't in German yet
i18n.addResourceBundle('eng', 'ui', en.organized, true, true);
i18n.addResourceBundle('deu', 'ui', de.organized, true, true);
// the English written in the main app's territory pages
i18n.addResourceBundle('deu', 'text', text);
store.set(appLocaleState, determineAppLocale(i18n.language));

// no congregation settings here: dates follow the language
const setDateFormat = (language: string) =>
  store.set(settingsState, (settings) => ({
    ...settings,
    cong_settings: {
      ...settings.cong_settings,
      short_date_format: settings.cong_settings.short_date_format.map(
        (record) => ({
          ...record,
          value: language === 'deu' ? 'dd.MM.yyyy' : 'MM/dd/yyyy',
        })
      ),
    },
  }));

setDateFormat(i18n.language);

export const LANGUAGES = [
  { code: 'eng', name: 'English' },
  { code: 'deu', name: 'Deutsch' },
];

export const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key, { ns: NS, ...options }) as string;

/** "A", "A and B", "A, B and C" */
export const list = (parts: string[]) =>
  parts.length < 2
    ? (parts[0] ?? '')
    : t('common.list', {
        first: parts.slice(0, -1).join(', '),
        last: parts.at(-1),
      });

export const setLanguage = async (language: string) => {
  try {
    localStorage.setItem('ui_lang', language);
    localStorage.setItem('ui_lang_picked', '1');
  } catch {
    // applies until the app restarts
  }
  // the main app's pages read both while rendering, so they change together
  store.set(appLangState, language);
  await refreshLocalesResources();
  store.set(appLocaleState, determineAppLocale(language));
  setDateFormat(language);
  await i18n.changeLanguage(language);
};
