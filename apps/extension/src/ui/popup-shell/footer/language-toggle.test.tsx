// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  locale: 'ru' as 'ru' | 'en',
  setLocalePreference: vi.fn().mockResolvedValue(undefined),
  translate: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/popup')>()),
  setLocalePreference: mocks.setLocalePreference,
  translate: mocks.translate,
  useAppLocale: () => mocks.locale,
}));

import { PopupFooterLanguageToggle } from './language-toggle';

it('shows the current locale and switches through the canonical locale authority', () => {
  const container = document.createElement('div');
  const root = createRoot(container);

  act(() => root.render(<PopupFooterLanguageToggle />));
  const button = container.querySelector('button');

  expect(button?.textContent).toBe('ru');
  expect(button?.getAttribute('data-locale-preference')).toBe('ru');
  expect(button?.title).toBe('common.languages.ru → common.languages.en');
  act(() => button?.click());
  expect(mocks.setLocalePreference).toHaveBeenCalledWith('en');

  act(() => root.unmount());
});
