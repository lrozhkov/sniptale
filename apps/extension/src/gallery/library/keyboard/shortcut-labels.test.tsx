import { afterEach, expect, it, vi } from 'vitest';
import { getGalleryPrimaryShortcut, getGalleryShortcutTitle } from './shortcut-labels';
afterEach(() => vi.unstubAllGlobals());
it.each([
  ['Win32', 'Ctrl+A', 'Ctrl+F'],
  ['Linux', 'Ctrl+A', 'Ctrl+F'],
  ['MacIntel', '⌘A', '⌘F'],
])('labels actual primary commands on %s', (platform, all, find) => {
  vi.stubGlobal('navigator', { platform });
  expect(getGalleryPrimaryShortcut('A')).toBe(all);
  expect(getGalleryPrimaryShortcut('F')).toBe(find);
  expect(getGalleryShortcutTitle('Search', find)).toBe(`Search (${find})`);
});
