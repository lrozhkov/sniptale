import en from '../../platform/i18n/catalogs/en.json';
import ru from '../../platform/i18n/catalogs/ru.json';
import { prepareTranslations, setLocalePreference } from '../../platform/i18n/locale/state';
import type { CatalogProfile } from '../../platform/i18n/catalog-profiles';
import type { AppLocale } from '@sniptale/runtime-contracts/i18n';

const catalogs = { en, ru };
const preparedFixtures = new Map<AppLocale, Record<string, string>>();

/** Supply authored messages through the transport seam in direct UI component tests. */
export function loadUiCatalogFixture(locale: AppLocale): Promise<Record<string, string>> {
  const existing = preparedFixtures.get(locale);
  if (existing) return Promise.resolve(existing);
  const messages: Record<string, string> = {};
  function visit(value: unknown, prefix: string) {
    if (typeof value === 'string') {
      messages[prefix] = value;
      return;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid UI test catalog fixture');
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, prefix ? `${prefix}.${key}` : key);
    }
  }
  visit(catalogs[locale], '');
  preparedFixtures.set(locale, messages);
  return Promise.resolve(messages);
}

/** Direct renders prepare their caller profile and select the test language explicitly. */
export async function prepareUiTranslations(
  profile: CatalogProfile,
  locale: AppLocale
): Promise<void> {
  await prepareTranslations(profile, locale);
  await setLocalePreference(locale);
}
