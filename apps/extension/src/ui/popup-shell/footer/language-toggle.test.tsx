// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  locale: 'ru' as 'ru' | 'en',
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
