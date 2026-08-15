import { describe, expect, it } from 'vitest';
import { createSystemViewportPresetCatalog } from './catalog';
import { parseViewportPresetCatalog } from './parser';

describe('window-size preset parser', () => {
  it('accepts the exact current window-only catalog', () => {
    const catalog = createSystemViewportPresetCatalog();
    expect(parseViewportPresetCatalog(catalog)).toEqual(catalog);
  });

  it('drops legacy viewport catalogs instead of migrating them', () => {
    const legacy = [
      ...createSystemViewportPresetCatalog(),
      {
        enabled: true,
        height: 720,
        id: 'legacy-viewport',
        kind: 'user',
        name: 'Legacy viewport',
        order: 0,
        target: 'viewport',
        width: 1280,
      },
    ];
    expect(parseViewportPresetCatalog(legacy)).toBeUndefined();
  });

  it('rejects old catalog revisions', () => {
    const catalog = createSystemViewportPresetCatalog().map((preset) =>
      preset.kind === 'system' ? { ...preset, catalogRevision: 2 } : preset
    );
    expect(parseViewportPresetCatalog(catalog)).toBeUndefined();
  });
});
