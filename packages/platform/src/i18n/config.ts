import { LOCALE_REGISTRY, type AppLocale } from '@sniptale/runtime-contracts/i18n';

export {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  isAppLocale,
  type AppLocale,
} from '@sniptale/runtime-contracts/i18n';

/**
 * Resolves the Intl locale tag used by number, date, and collation helpers.
 */
export function getIntlLocale(locale: AppLocale): string {
  return LOCALE_REGISTRY[locale].intlLocale;
}
