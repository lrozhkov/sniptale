import { describe, expect, it } from 'vitest';
import { normalizeSettingsTab, SETTINGS_NAV_ITEMS } from '.';
import { DEFERRED_SETTINGS_SECTION_LOADERS } from './registry';
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

  it('loads the storage and drafts section from its registered owner', async () => {
    const descriptor = DEFERRED_SETTINGS_SECTION_LOADERS['storage-drafts'];
    await expect(descriptor.load()).resolves.toHaveProperty(descriptor.exportName);
  });

  it('keeps every deferred section loader executable and aligned with its export', async () => {
    for (const descriptor of Object.values(DEFERRED_SETTINGS_SECTION_LOADERS)) {
      await expect(descriptor.load()).resolves.toHaveProperty(descriptor.exportName);
    }
  });

  it('keeps visible tabs and normalizes unknown persisted values', () => {
    expect(normalizeSettingsTab('media-quality')).toBe('media-quality');
    expect(normalizeSettingsTab('retired')).toBe('interface-browser');
  });
});
