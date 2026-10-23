// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { applyAppTheme } from './dom';

afterEach(() => vi.unstubAllGlobals());

it.each(['dark', 'light'] as const)('marks Windows on the existing %s theme target', (theme) => {
  vi.stubGlobal('navigator', { platform: 'Win32' });
  const target = document.createElement('div');
  applyAppTheme(theme, target, { applyColorSchemeInline: false });
  expect(target.getAttribute('data-ui-platform')).toBe('windows');
  expect(target.getAttribute('data-theme')).toBe(theme);
  expect(target.style.colorScheme).toBe('');
});

it('removes the Windows hint on other platforms without replacing the theme owner', () => {
  vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
  const target = document.createElement('div');
  target.setAttribute('data-ui-platform', 'windows');
  applyAppTheme('dark', target);
  expect(target.hasAttribute('data-ui-platform')).toBe(false);
  expect(target.style.colorScheme).toBe('dark');
});
