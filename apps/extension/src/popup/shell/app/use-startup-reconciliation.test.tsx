// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  disposeLocale: vi.fn(),
  disposeTheme: vi.fn(),
  initializeTheme: vi.fn(),
  setLocale: vi.fn(),
  subscribeLocale: vi.fn(),
}));

vi.mock('../../../ui/theme', () => ({
  AppTheme: undefined,
  AppThemePreference: undefined,
  applyScopedThemePreview: vi.fn(),
  getStoredThemePreference: vi.fn(),
  initializeAppTheme: vi.fn(),
  initializeExtensionPageTheme: mocks.initializeTheme,
  resolveAppTheme: vi.fn(),
  setAppThemePreference: vi.fn(),
}));
vi.mock('../../../platform/i18n/locale/state', () => ({
  getCurrentLocale: () => 'en',
  getStoredLocalePreference: vi.fn(),
  setLocalePreference: vi.fn(),
  subscribeToLocaleChanges: mocks.subscribeLocale,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initializeTheme.mockReturnValue(mocks.disposeTheme);
  mocks.subscribeLocale.mockReturnValue(mocks.disposeLocale);
});

it('reconciles theme and locale after the shell commit and disposes both subscriptions', async () => {
  const { usePopupStartupReconciliation } = await import('./use-startup-reconciliation');
  function Harness() {
    usePopupStartupReconciliation(mocks.setLocale);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  await vi.dynamicImportSettled();
  expect(mocks.initializeTheme).toHaveBeenCalledOnce();
  expect(mocks.setLocale).toHaveBeenCalledWith('en');
  expect(mocks.subscribeLocale).toHaveBeenCalledOnce();
  act(() => root.unmount());
  expect(mocks.disposeTheme).toHaveBeenCalledOnce();
  expect(mocks.disposeLocale).toHaveBeenCalledOnce();
});

it('disposes a late theme initializer without subscribing locale after unmount', async () => {
  const { usePopupStartupReconciliation } = await import('./use-startup-reconciliation');
  function Harness() {
    usePopupStartupReconciliation(mocks.setLocale);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  act(() => root.unmount());
  await vi.dynamicImportSettled();
  expect(mocks.disposeTheme).toHaveBeenCalledOnce();
  expect(mocks.subscribeLocale).not.toHaveBeenCalled();
});
