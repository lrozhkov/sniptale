import en from '../platform/i18n/catalogs/en.json';
import ru from '../platform/i18n/catalogs/ru.json';
import { prepareTranslations, setLocalePreference } from '../platform/i18n/locale/state';
import type { AppLocale } from '@sniptale/platform/i18n/config';

const catalogs = { en, ru };

/** Provide authored catalog data through the normal transport seam in popup tests. */
export function loadPopupCatalogFixture(locale: AppLocale): Promise<Record<string, string>> {
  const messages: Record<string, string> = {};
  function visit(value: unknown, prefix: string) {
    if (typeof value === 'string') {
      messages[prefix] = value;
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid popup test catalog fixture');
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, prefix ? `${prefix}.${key}` : key);
    }
  }
  visit(catalogs[locale], '');
  return Promise.resolve(messages);
}

/** Model completed English popup startup before direct runtime or component execution. */
export function preparePopupTranslations(): Promise<void> {
  return prepareTranslations('popup', 'en');
}

/** Keep Russian interface assertions explicit while production uses the English default. */
export async function prepareRussianPopupTranslations(): Promise<void> {
  await prepareTranslations('popup');
  await setLocalePreference('ru');
}

/** Prepare the two locales that the sync-status switching test explicitly exercises. */
export async function prepareBilingualPopupTranslations(): Promise<void> {
  await preparePopupTranslations();
  await prepareTranslations('popup', 'ru');
}
