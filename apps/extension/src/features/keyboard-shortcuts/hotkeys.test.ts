import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HotkeyConfig } from '../../contracts/settings';

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

describe('utils hotkeys', () => {
  it('builds key strings and detects reserved hotkeys', async () => {
    const { hotkeyToKeyString, isHotkeyReserved } = await import('./hotkeys');
    const reserved = createHotkey({ ctrlKey: true, key: 't' });
    const custom = createHotkey({ altKey: true, key: ' ' });

    expect(hotkeyToKeyString(reserved)).toBe('Ctrl+T');
    expect(hotkeyToKeyString(custom)).toBe('Alt+Space');
    expect(isHotkeyReserved(reserved)).toBe(true);
    expect(isHotkeyReserved(custom)).toBe(false);
  });

  it('canonicalizes physical keys across Latin and Cyrillic layouts', async () => {
    const { hotkeyToKeyString, matchesHotkeyEvent, normalizeShortcutLabel } =
      await import('./hotkeys');
    const saveHotkey = createHotkey({ ctrlKey: true, key: 's' });

    expect(hotkeyToKeyString(createHotkey({ ctrlKey: true, key: 'ы' }))).toBe('Ctrl+S');
    expect(normalizeShortcutLabel('Ctrl+Ы')).toBe('Ctrl+S');
    expect(matchesHotkeyEvent({ ...saveHotkey, code: 'KeyS', key: 'ы' }, saveHotkey)).toBe(true);
  });

  it('uses physical event codes before locale-specific key values', async () => {
    const { hotkeyEventToConfig, matchesHotkeyEvent, normalizeShortcutLabel } =
      await import('./hotkeys');
    const saveHotkey = createHotkey({ ctrlKey: true, key: 's' });

    expect(hotkeyEventToConfig({ ...saveHotkey, code: 'KeyS', key: 'σ' })).toEqual({
      ...saveHotkey,
      key: 'S',
    });
    expect(matchesHotkeyEvent({ ...saveHotkey, code: 'KeyS', key: 'ד' }, saveHotkey)).toBe(true);
    expect(normalizeShortcutLabel('Ctrl+Σ')).toBe('Ctrl+S');
    expect(normalizeShortcutLabel('Ctrl+І')).toBe('Ctrl+S');
  });

  it('formats mac command hotkeys in reserved-key form', async () => {
    const { hotkeyToKeyString } = await import('./hotkeys');

    setNavigator('MacIntel', 'Macintosh');
    expect(hotkeyToKeyString(createHotkey({ key: 'tab', metaKey: true }))).toBe('Cmd+Tab');
  });
});
