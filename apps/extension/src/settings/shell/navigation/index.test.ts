import { afterEach, describe, expect, it, vi } from 'vitest';

function setRulesUiFlag(value: boolean | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, '__ENABLE_PAGE_STYLE_RULES__');
    return;
  }

  Object.defineProperty(globalThis, '__ENABLE_PAGE_STYLE_RULES__', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  vi.resetModules();
  setRulesUiFlag(undefined);
});

describe('settings navigation items', () => {
  it('includes editor and page style management tabs outside release builds', async () => {
    setRulesUiFlag(true);
    const { SETTINGS_NAV_ITEMS } = await import('.');

    expect(SETTINGS_NAV_ITEMS).toContainEqual(
      expect.objectContaining({
        id: 'editor',
        label: 'settings.navigation.editor',
      })
    );
    expect(SETTINGS_NAV_ITEMS).toContainEqual(
      expect.objectContaining({
        id: 'pageStyles',
        label: 'settings.navigation.pageStyles',
      })
    );
    expect(SETTINGS_NAV_ITEMS).toContainEqual(
      expect.objectContaining({
        id: 'privacy',
        label: 'settings.navigation.privacy',
      })
    );
  });

  it('hides page style management tabs when rules UI is release-gated', async () => {
    setRulesUiFlag(false);
    const { SETTINGS_NAV_ITEMS, normalizeSettingsTab } = await import('.');

    expect(SETTINGS_NAV_ITEMS).not.toContainEqual(expect.objectContaining({ id: 'pageStyles' }));
    expect(normalizeSettingsTab('pageStyles')).toBe('appearance');
  });
});
