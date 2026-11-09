import { FALLBACK_LOCALE, type AppLocale } from '@sniptale/platform/i18n/config';

function readLeaf(catalog: unknown, key: string): string | undefined {
  let current = catalog;
  for (const part of key.split('.')) {
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, part)) {
      return undefined;
    }
    current = Object.getOwnPropertyDescriptor(current, part)?.value;
  }
  return typeof current === 'string' ? current : undefined;
}

/** Reads one key from bundled catalogs and preserves the fallback policy. */
export function readCatalogTranslation(
  catalogs: Readonly<Record<AppLocale, unknown>>,
  locale: AppLocale,
  key: string
): string {
  return readLeaf(catalogs[locale], key) ?? readLeaf(catalogs[FALLBACK_LOCALE], key) ?? key;
}
