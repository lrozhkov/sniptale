import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HotkeyConfig } from '../../contracts/settings';
import { formatHotkey } from './hotkey-format';

function createHotkey(overrides: Partial<HotkeyConfig> = {}): HotkeyConfig {
  return {
    altKey: false,
    ctrlKey: false,
    key: 'k',
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

function setNavigator(platform: string, userAgent = platform) {
  vi.stubGlobal('navigator', { platform, userAgent });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('formatHotkey', () => {
  it('formats hotkeys for mac and non-mac platforms', () => {
    setNavigator('MacIntel', 'Macintosh');
    expect(
      formatHotkey(createHotkey({ altKey: true, key: ' ', metaKey: true, shiftKey: true }))
    ).toBe('⌘⌥⇧Space');

    setNavigator('Win32', 'Windows');
    expect(
      formatHotkey(
        createHotkey({ altKey: true, ctrlKey: true, key: 'a', metaKey: true, shiftKey: true })
      )
    ).toBe('Ctrl+Win+Alt+Shift+A');
  });

  it('normalizes legacy layout keys before formatting', () => {
    setNavigator('Win32', 'Windows');

    expect(formatHotkey(createHotkey({ ctrlKey: true, key: 'ы' }))).toBe('Ctrl+S');
  });

  it('formats mac command hotkeys in display form', () => {
    setNavigator('MacIntel', 'Macintosh');

    expect(formatHotkey(createHotkey({ key: 'tab', metaKey: true }))).toBe('⌘Tab');
  });
});
