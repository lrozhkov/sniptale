/* global document, window */

(() => {
  const storageKey = 'sniptale-theme-preference';
  const localeStorageKey = 'sniptale-locale-preference';
  let preference = 'system';
  let locale = 'en';

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
    // This paint hint does not select a catalog. Bootstrap checks the locale registry.
    if (
      storedLocale &&
      storedLocale
        .split('-')
        .every((part, index) =>
          index === 0 ? /^[a-z]{2,3}$/.test(part) : /^[A-Za-z0-9]{2,8}$/.test(part)
        )
    ) {
      locale = storedLocale;
    }
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
