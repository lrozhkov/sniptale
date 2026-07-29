import { describe, expect, it } from 'vitest';
import {
  createSystemViewportPresetCatalog,
  getCanonicalSystemViewportPreset,
  getSystemViewportPresetKeys,
} from './catalog';
import { parseViewportPresetCatalog } from './parser';

describe('viewport preset catalog', () => {
  it('defines the stable grouped v2 system catalog', () => {
    const catalog = createSystemViewportPresetCatalog();
    expect(catalog).toHaveLength(10);
    expect(catalog.map((preset) => preset.id)).toEqual([
      'system:viewport-mobile-portrait',
      'system:viewport-mobile-landscape',
      'system:viewport-tablet-portrait',
      'system:viewport-tablet-landscape',
      'system:viewport-hd',
      'system:viewport-full-hd',
      'system:window-hd',
      'system:window-laptop',
      'system:window-desktop',
      'system:window-full-hd',
    ]);
    expect(catalog.filter((preset) => preset.width === 1280 && preset.height === 720)).toEqual([
      expect.objectContaining({ target: 'viewport' }),
      expect.objectContaining({ target: 'window' }),
    ]);
    expect(catalog.every((preset) => preset.enabled)).toBe(true);
  });

  it('returns clones instead of exposing canonical entries', () => {
    const first = getCanonicalSystemViewportPreset('viewportMobilePortrait');
    const second = getCanonicalSystemViewportPreset('viewportMobilePortrait');
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it('exposes stable keys and fails closed for an unknown system key', () => {
    expect(getSystemViewportPresetKeys()).toEqual([
      'viewportMobilePortrait',
      'viewportMobileLandscape',
      'viewportTabletPortrait',
      'viewportTabletLandscape',
      'viewportHd',
      'viewportFullHd',
      'windowHd',
      'windowLaptop',
      'windowDesktop',
      'windowFullHd',
    ]);
    expect(() => Reflect.apply(getCanonicalSystemViewportPreset, null, ['unknown'])).toThrow(
      'Unknown system viewport preset'
    );
  });

  it('atomically rejects legacy and partially invalid catalogs', () => {
    expect(parseViewportPresetCatalog([{ id: 'hd', width: 1280, height: 720 }])).toBeUndefined();
    const catalog = createSystemViewportPresetCatalog();
    expect(parseViewportPresetCatalog([...catalog, { id: 'broken' }])).toBeUndefined();
    expect(
      parseViewportPresetCatalog(
        catalog.map((preset, index) => (index === 0 ? { ...preset, order: 1 } : preset))
      )
    ).toBeUndefined();
  });
});
