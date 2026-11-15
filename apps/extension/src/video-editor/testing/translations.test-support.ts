import en from '../../platform/i18n/catalogs/en.json';
import ru from '../../platform/i18n/catalogs/ru.json';
import { prepareTranslations, setLocalePreference, type AppLocale } from '../../platform/i18n';

/** Supply authored copy to this owner's test transport without changing runtime translation. */
export function videoeditorFixtureMessages(locale: AppLocale): Record<string, string> {
  return flatten(locale === 'ru' ? ru : en);
}

/** Prepare this owner's profile and explicitly select the language before direct test rendering. */
export async function prepareVideoEditorTranslations(locale: AppLocale = 'en'): Promise<void> {
  await prepareTranslations('video-editor', locale);
  await setLocalePreference(locale);
}

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid authored catalog fixture');
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(flatten(child, prefix ? `${prefix}.${key}` : key))
    )
  );
}
