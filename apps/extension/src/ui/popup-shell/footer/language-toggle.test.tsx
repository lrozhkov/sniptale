// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, expect, it, vi } from 'vitest';
import { SUPPORTED_LOCALES, type AppLocale } from '@sniptale/runtime-contracts/i18n';
import en from '../../../platform/i18n/catalogs/en.json';
import ru from '../../../platform/i18n/catalogs/ru.json';
import { prepareTranslations } from '../../../platform/i18n';

vi.mock('../../../platform/i18n/catalog-transport', () => ({
  loadCatalogMessages: vi.fn(async (locale: AppLocale) =>
    flatCatalogFixture(locale === 'ru' ? ru : en)
  ),
}));

beforeAll(async () => {
  await prepareTranslations('popup', 'ru');
});

const mocks = vi.hoisted(() => ({
  locale: 'ru' as AppLocale,
  setLocalePreference: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../platform/i18n/popup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n/popup')>();
  return {
    ...actual,
    setLocalePreference: mocks.setLocalePreference,
    translate: (key: Parameters<typeof actual.translate>[0]) => actual.translate(key, mocks.locale),
    useAppLocale: () => mocks.locale,
  };
});

import { PopupFooterLanguageToggle } from './language-toggle';

it.each([
  { locale: 'ru', nextLocale: 'en', hint: 'Русский → English' },
  { locale: 'en', nextLocale: 'ru', hint: 'English → Russian' },
] as const)(
  'resolves the $locale hint and switches through the canonical locale authority',
  ({ locale, nextLocale, hint }) => {
    mocks.locale = locale;
    mocks.setLocalePreference.mockClear();
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => root.render(<PopupFooterLanguageToggle />));
    const button = container.querySelector('button');

    expect(button?.textContent).toBe(locale);
    expect(button?.getAttribute('data-locale-preference')).toBe(locale);
    expect(button?.getAttribute('data-popup-hint')).toBe(hint);
    act(() => button?.click());
    expect(mocks.setLocalePreference).toHaveBeenCalledWith(nextLocale);

    act(() => root.unmount());
  }
);

it.each(SUPPORTED_LOCALES)(
  'cycles every registered language from %s through the existing button',
  (locale) => {
    mocks.locale = locale;
    mocks.setLocalePreference.mockClear();
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<PopupFooterLanguageToggle />));
    const button = container.querySelector('button');
    expect(button?.textContent).toBe(locale);
    act(() => button?.click());
    expect(mocks.setLocalePreference).toHaveBeenCalledWith(
      SUPPORTED_LOCALES[(SUPPORTED_LOCALES.indexOf(locale) + 1) % SUPPORTED_LOCALES.length]
    );
    act(() => root.unmount());
  }
);

function flatCatalogFixture(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid authored catalog fixture');
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(flatCatalogFixture(child, prefix ? `${prefix}.${key}` : key))
    )
  );
}
