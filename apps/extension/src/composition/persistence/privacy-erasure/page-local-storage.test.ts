// @vitest-environment jsdom

import { beforeEach, expect, it } from 'vitest';

import {
  eraseExtensionPageLocalStorage,
  verifyExtensionPageLocalStorageErased,
} from './page-local-storage';

beforeEach(() => {
  window.localStorage.clear();
});

it('preserves locale and theme preferences in preserve mode', () => {
  window.localStorage.setItem('sniptale-theme-preference', 'dark');
  window.localStorage.setItem('sniptale-locale-preference', 'en');
  window.localStorage.setItem('sniptale.popup.trace', '1');
  window.localStorage.setItem('sniptale:trace:namespaces', 'ContentToolbarEventDelivery');

  const removed = eraseExtensionPageLocalStorage(window.localStorage, {
    preservePreferences: true,
  });

  expect(removed).toEqual(
    expect.arrayContaining(['sniptale.popup.trace', 'sniptale:trace:namespaces'])
  );
  expect(window.localStorage.getItem('sniptale-theme-preference')).toBe('dark');
  expect(window.localStorage.getItem('sniptale-locale-preference')).toBe('en');
  expect(
    verifyExtensionPageLocalStorageErased(window.localStorage, { preservePreferences: true })
  ).toBe(true);
});

it('removes locale and theme preferences in factory reset mode', () => {
  window.localStorage.setItem('sniptale-theme-preference', 'dark');
  window.localStorage.setItem('sniptale-locale-preference', 'en');

  eraseExtensionPageLocalStorage(window.localStorage, { preservePreferences: false });

  expect(window.localStorage.getItem('sniptale-theme-preference')).toBeNull();
  expect(window.localStorage.getItem('sniptale-locale-preference')).toBeNull();
  expect(
    verifyExtensionPageLocalStorageErased(window.localStorage, { preservePreferences: false })
  ).toBe(true);
});

it('detects a leftover page-local erasure key', () => {
  window.localStorage.setItem('sniptale:trace:namespaces', 'ContentToolbarEventDelivery');

  expect(
    verifyExtensionPageLocalStorageErased(window.localStorage, { preservePreferences: true })
  ).toBe(false);
});
