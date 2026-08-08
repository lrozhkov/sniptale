import { describe, expect, it } from 'vitest';
import { normalizeSettingsTab, SETTINGS_NAV_ITEMS } from '.';
import { SETTINGS_SECTION_IDS } from '../../../platform/navigation/extension-pages/settings-route/codec';

describe('settings navigation items', () => {
  it('keeps product settings and omits retired page style management', () => {
    expect(SETTINGS_NAV_ITEMS).toContainEqual(
      expect.objectContaining({
        id: 'editor-resources',
        label: 'settings.navigation.editorResources',
      })
    );
    expect(SETTINGS_NAV_ITEMS).toContainEqual(
      expect.objectContaining({ id: 'access-data', label: 'settings.navigation.accessData' })
    );
    expect(SETTINGS_NAV_ITEMS).toContainEqual(
      expect.objectContaining({ id: 'media-quality', label: 'settings.navigation.mediaQuality' })
    );
    expect(SETTINGS_NAV_ITEMS).not.toContainEqual(expect.objectContaining({ id: 'pageStyles' }));
  });

  it('keeps the presentation registry synchronized with the platform route codec', () => {
    expect(SETTINGS_NAV_ITEMS.map(({ id }) => id)).toEqual(SETTINGS_SECTION_IDS);
  });

  it('keeps visible tabs and normalizes unknown persisted values', () => {
    expect(normalizeSettingsTab('media-quality')).toBe('media-quality');
    expect(normalizeSettingsTab('retired')).toBe('interface-browser');
  });
});
