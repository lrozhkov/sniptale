import { describe, expect, it } from 'vitest';
import { SETTINGS_NAV_ITEMS } from '.';

describe('settings navigation items', () => {
  it('keeps product settings and omits retired page style management', () => {
    expect(SETTINGS_NAV_ITEMS).toContainEqual(
      expect.objectContaining({ id: 'editor', label: 'settings.navigation.editor' })
    );
    expect(SETTINGS_NAV_ITEMS).toContainEqual(
      expect.objectContaining({ id: 'privacy', label: 'settings.navigation.privacy' })
    );
    expect(SETTINGS_NAV_ITEMS).not.toContainEqual(expect.objectContaining({ id: 'pageStyles' }));
  });
});
