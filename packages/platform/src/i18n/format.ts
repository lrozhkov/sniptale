import { DEFAULT_LOCALE, getIntlLocale, type AppLocale } from './config';

const DEFAULT_FORMAT_LOCALE: AppLocale = DEFAULT_LOCALE;

const MAX_FORMATTERS = 64;
const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterKey(locale: AppLocale, options?: object): string | null {
  if (!options) return locale;
  const prototype: unknown = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const entries = Object.entries(Object.getOwnPropertyDescriptors(options)).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  // Accessors and coercible objects keep native Intl evaluation semantics.
  if (
    entries.some(
      ([, entry]) =>
        !('value' in entry) ||
        (entry.value !== undefined &&
          typeof entry.value !== 'string' &&
          typeof entry.value !== 'number' &&
          typeof entry.value !== 'boolean')
    )
  )
    return null;
  return JSON.stringify([
    locale,
    entries.map(([name, entry]) => [name, typeof entry.value, String(entry.value)]),
  ]);
}

function retainFormatter<T>(cache: Map<string, T>, key: string | null, formatter: T): T {
  if (key !== null) {
    if (cache.size >= MAX_FORMATTERS) cache.delete(cache.keys().next().value!);
    cache.set(key, formatter);
  }
  return formatter;
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale: AppLocale = DEFAULT_FORMAT_LOCALE
): string {
  const key = formatterKey(locale, options);
  const formatter =
    (key === null ? undefined : numberFormatters.get(key)) ??
    retainFormatter(numberFormatters, key, new Intl.NumberFormat(getIntlLocale(locale), options));
  return formatter.format(value);
}

export function formatDateTime(
  value: number | Date,
  options?: Intl.DateTimeFormatOptions,
  locale: AppLocale = DEFAULT_FORMAT_LOCALE
): string {
  const optionsKey = formatterKey(locale, options);
  // Include the local zone signature so changing the system zone does not reuse its old formatter.
  const key = optionsKey === null ? null : `${optionsKey}:${new Date().toString().slice(25)}`;
  const formatter =
    (key === null ? undefined : dateFormatters.get(key)) ??
    retainFormatter(dateFormatters, key, new Intl.DateTimeFormat(getIntlLocale(locale), options));
  return formatter.format(value);
}

export function compareStrings(
  left: string,
  right: string,
  locale: AppLocale = DEFAULT_FORMAT_LOCALE
): number {
  return left.localeCompare(right, getIntlLocale(locale));
}
