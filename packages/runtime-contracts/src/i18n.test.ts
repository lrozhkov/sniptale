import { expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  isAppLocale,
  LOCALE_REGISTRY,
  SUPPORTED_LOCALES,
} from './i18n';

it('derives the supported identities from one registry and retains their order', () => {
  expect(SUPPORTED_LOCALES).toEqual(Object.keys(LOCALE_REGISTRY));
  expect(SUPPORTED_LOCALES.filter((locale) => locale === 'ru' || locale === 'en')).toEqual([
    'ru',
    'en',
  ]);
  expect(Object.isFrozen(SUPPORTED_LOCALES)).toBe(true);
  expect(DEFAULT_LOCALE).toBe('en');
  expect(FALLBACK_LOCALE).toBe('en');
});

it.each(SUPPORTED_LOCALES)(
  'accepts registered identity %s with its Intl tag metadata',
  (locale) => {
    expect(isAppLocale(locale)).toBe(true);
    expect(LOCALE_REGISTRY[locale].intlLocale).toBeTruthy();
    expect(LOCALE_REGISTRY[locale].nativeName.trim()).not.toBe('');
  }
);

it.each([
  null,
  undefined,
  1,
  {},
  [],
  '',
  'EN',
  '__unsupported__',
  '__proto__',
  'constructor',
  'toString',
])('refuses unregistered or nonstring identity %j without coercion', (value) =>
  expect(isAppLocale(value)).toBe(false)
);

it('does not normalize an unregistered Intl tag into an application identity', () => {
  const identities: readonly string[] = SUPPORTED_LOCALES;
  for (const { intlLocale } of Object.values(LOCALE_REGISTRY)) {
    if (!identities.includes(intlLocale)) {
      expect(isAppLocale(intlLocale)).toBe(false);
    }
  }
});
