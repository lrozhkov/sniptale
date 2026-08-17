/* global document, window */

(() => {
  const storageKey = 'sniptale-theme-preference';
  const localeStorageKey = 'sniptale-locale-preference';
  let preference = 'system';
  let locale = 'ru';

  try {
    const storedPreference = window.localStorage.getItem(storageKey);
    if (
      storedPreference === 'light' ||
      storedPreference === 'dark' ||
      storedPreference === 'system'
    ) {
      preference = storedPreference;
    }
    const storedLocale = window.localStorage.getItem(localeStorageKey);
    if (storedLocale === 'en' || storedLocale === 'ru') locale = storedLocale;
  } catch {
    // The system preference below remains the fail-safe first-paint source.
  }

  const theme =
    preference === 'light' || preference === 'dark'
      ? preference
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';

  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.locale = locale;
  document.documentElement.lang = locale;
  document.documentElement.style.colorScheme = theme;
})();
