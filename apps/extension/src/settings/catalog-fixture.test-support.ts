import en from '../platform/i18n/catalogs/en.json';
import ru from '../platform/i18n/catalogs/ru.json';
import type { AppLocale } from '@sniptale/runtime-contracts/i18n';

const catalogs = { en, ru };
const fixtures = new Map<AppLocale, Record<string, string>>();

/** Supply authored copy through the catalog transport in direct Settings tests. */
export function loadSettingsCatalogFixture(locale: AppLocale): Promise<Record<string, string>> {
  const existing = fixtures.get(locale);
  if (existing) return Promise.resolve(existing);
  const messages: Record<string, string> = {};
  function visit(value: unknown, prefix: string) {
    if (typeof value === 'string') {
      messages[prefix] = value;
      return;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid Settings catalog fixture');
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, prefix ? `${prefix}.${key}` : key);
    }
  }
  visit(catalogs[locale], '');
  fixtures.set(locale, messages);
  return Promise.resolve(messages);
}

/** Prepare the caller profile and explicitly select the language used by the test. */
export async function prepareSettingsTranslations(locale: AppLocale): Promise<void> {
  const { prepareTranslations, setLocalePreference } =
    await import('../platform/i18n/locale/state');
  await prepareTranslations('settings', locale);
  await setLocalePreference(locale);
}
