import en from '../../../platform/i18n/catalogs/en.json';
import ru from '../../../platform/i18n/catalogs/ru.json';
import { prepareTranslations } from '../../../platform/i18n/locale/state';
import type { AppLocale } from '@sniptale/platform/i18n/config';

const catalogs = { en, ru };

/** Supply authored messages through the transport seam in direct component tests. */
export function loadScenarioCatalogFixture(locale: AppLocale): Promise<Record<string, string>> {
  const messages: Record<string, string> = {};
  function visit(value: unknown, prefix: string) {
    if (typeof value === 'string') {
      messages[prefix] = value;
      return;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid scenario test catalog fixture');
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, prefix ? `${prefix}.${key}` : key);
    }
  }
  visit(catalogs[locale], '');
  return Promise.resolve(messages);
}

/** Direct component renders start after the same catalog preparation as the page entry. */
export function prepareScenarioTranslations(): Promise<void> {
  return prepareTranslations('scenario-editor', 'en');
}

/** Prepare the explicitly exercised Russian translator alongside the English page locale. */
export async function prepareScenarioBilingualTranslations(): Promise<void> {
  await prepareScenarioTranslations();
  await prepareTranslations('scenario-editor', 'ru');
}
