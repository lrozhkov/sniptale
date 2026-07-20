import { DEFAULT_LOCALE, getIntlLocale, type AppLocale } from './config';

const DEFAULT_FORMAT_LOCALE: AppLocale = DEFAULT_LOCALE;

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale: AppLocale = DEFAULT_FORMAT_LOCALE
): string {
  return new Intl.NumberFormat(getIntlLocale(locale), options).format(value);
}

export function formatDateTime(
  value: number | Date,
  options?: Intl.DateTimeFormatOptions,
  locale: AppLocale = DEFAULT_FORMAT_LOCALE
): string {
  return new Intl.DateTimeFormat(getIntlLocale(locale), options).format(value);
}

export function compareStrings(
  left: string,
  right: string,
  locale: AppLocale = DEFAULT_FORMAT_LOCALE
): number {
  return left.localeCompare(right, getIntlLocale(locale));
}
