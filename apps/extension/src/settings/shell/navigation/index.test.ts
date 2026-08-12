import { describe, expect, it } from 'vitest';
import { normalizeSettingsTab, SETTINGS_NAV_ITEMS } from '.';
import { DEFERRED_SETTINGS_SECTION_LOADERS, SETTINGS_NAV_ITEMS_BY_ID } from './registry';
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
    expect(Object.keys(SETTINGS_NAV_ITEMS_BY_ID)).toEqual(SETTINGS_SECTION_IDS);
    expect(
      SETTINGS_NAV_ITEMS.every((item) => item.description.startsWith('settings.navigation.'))
    ).toBe(true);
  });

  it('composes storage and drafts inside saving instead of registering a second page', () => {
    expect(DEFERRED_SETTINGS_SECTION_LOADERS).not.toHaveProperty('storage-drafts');
  });

  it('keeps every deferred section loader executable and aligned with its export', async () => {
    await Promise.all(
      Object.values(DEFERRED_SETTINGS_SECTION_LOADERS).map(async (descriptor) =>
        expect(descriptor.load()).resolves.toHaveProperty(descriptor.exportName)
      )
    );
  }, 15_000);

  it('keeps visible tabs and normalizes unknown persisted values', () => {
    expect(normalizeSettingsTab('media-quality')).toBe('media-quality');
    expect(normalizeSettingsTab('retired')).toBe('interface-browser');
  });
});
