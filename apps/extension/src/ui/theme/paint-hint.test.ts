// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { resolveAppTheme, THEME_STORAGE_KEY } from './paint-hint';
import { readThemePaintHint } from './preference-service';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.body.removeAttribute('data-theme');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: true })),
  });
});

it('resolves an explicit stored paint hint before asynchronous theme hydration', () => {
  window.localStorage.setItem(THEME_STORAGE_KEY, 'light');

  expect(readThemePaintHint()).toBe('light');
  expect(resolveAppTheme(readThemePaintHint() ?? 'system')).toBe('light');
});

it('falls back to the system palette when no valid hint exists', () => {
  window.localStorage.setItem(THEME_STORAGE_KEY, 'invalid');

  expect(readThemePaintHint()).toBeNull();
  expect(resolveAppTheme(readThemePaintHint() ?? 'system')).toBe('dark');
});
