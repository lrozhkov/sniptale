import type { Page } from '@playwright/test';

/** Seed the locale mirror before application modules initialize in each navigation. */
export async function installBrowserLocaleBeforeNavigation(
  target: Pick<Page, 'addInitScript'>,
  locale: 'en' | 'ru'
) {
  await target.addInitScript(
    (value) => localStorage.setItem('sniptale-locale-preference', value),
    locale
  );
}
