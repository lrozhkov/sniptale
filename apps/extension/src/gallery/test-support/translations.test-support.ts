import en from '../../platform/i18n/catalogs/en.json';
import ru from '../../platform/i18n/catalogs/ru.json';
import type { AppLocale } from '@sniptale/platform/i18n/config';

/** Supply authored messages through the transport seam in direct gallery tests. */
export function loadGalleryCatalogFixture(locale: AppLocale): Promise<Record<string, string>> {
  const messages: Record<string, string> = {};
  function visit(value: unknown, prefix: string) {
    if (typeof value === 'string') {
      messages[prefix] = value;
      return;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid gallery test catalog fixture');
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, prefix ? `${prefix}.${key}` : key);
    }
  }
  visit({ en, ru }[locale], '');
  return Promise.resolve(messages);
}

/** Prepare the real synchronous translator and explicitly select this test's language. */
export async function prepareGalleryTranslations(locale: AppLocale): Promise<void> {
  const state = await import('../../platform/i18n/locale/state');
  await state.prepareTranslations('gallery', locale);
  await state.setLocalePreference(locale);
}
