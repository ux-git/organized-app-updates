// Runs before the main app's i18n reads ui_lang: this app offers English and
// German only, German until someone picks English in My profile.
try {
  if (localStorage.getItem('ui_lang_picked') !== '1') {
    localStorage.setItem('ui_lang', 'deu');
  }
} catch {
  // the main app falls back to the browser's language
}
