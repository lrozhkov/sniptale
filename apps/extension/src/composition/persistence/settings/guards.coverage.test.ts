import { describe, expect, it } from 'vitest';

import { parseStoredSettings } from './guards';
import { createSystemViewportPresetCatalog } from '../../../features/viewport-presets/catalog';
import { normalizeViewportPresetOrder } from '../../../features/viewport-presets/operations';

const validViewportPresets = normalizeViewportPresetOrder([
  ...createSystemViewportPresetCatalog(),
  {
    kind: 'user' as const,
    id: 'tablet',
    name: 'Tablet',
    target: 'window' as const,
    width: 768,
    height: 1024,
    enabled: true,
    order: 9,
  },
]);

describe('settings guards valid payload coverage', () => {
  it('parses valid viewport presets and context-menu fields from storage payloads', () => {
    expect(
      parseStoredSettings({
        viewportPresets: validViewportPresets,
        presets: [{ id: 'preset-1', name: 'Preset', path: 'downloads', enabled: true, order: 1 }],
        contextMenu: {
          enabled: false,
          showScreenshots: false,
          showVideo: true,
          showExport: true,
          showImageEditor: true,
          showVideoEditor: false,
          showGallery: true,
          showPageLinkCopy: true,
          showWindowResize: false,
          showSettings: false,
        },
        fullPageCapture: {
          floatingElements: 'hide',
          freezeMotion: false,
          preloadLazyContent: true,
        },
      })
    ).toMatchObject({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      value: {
        viewportPresets: validViewportPresets,
        presets: [{ id: 'preset-1', name: 'Preset', path: 'downloads', enabled: true, order: 1 }],
        contextMenu: {
          enabled: false,
          showScreenshots: false,
          showVideo: true,
          showExport: true,
          showImageEditor: true,
          showVideoEditor: false,
          showGallery: true,
          showPageLinkCopy: true,
          showWindowResize: false,
          showSettings: false,
        },
        fullPageCapture: {
          floatingElements: 'hide',
          freezeMotion: false,
          preloadLazyContent: true,
        },
      },
    });
  });

  it('accepts bounded page capture timing', () => {
    expect(
      parseStoredSettings({
        pagePackageCaptureTiming: { loadTimeoutMs: 60_000, settleDelayMs: 3_000 },
      }).value.pagePackageCaptureTiming
    ).toEqual({ loadTimeoutMs: 60_000, settleDelayMs: 3_000 });
  });

  it('accepts bounded export resource limits', () => {
    expect(
      parseStoredSettings({
        exportResourceLimits: { maxFileCount: 50, maxFileSizeMiB: 20, maxTotalSizeMiB: 100 },
      }).value.exportResourceLimits
    ).toEqual({ maxFileCount: 50, maxFileSizeMiB: 20, maxTotalSizeMiB: 100 });
  });
});

describe('settings guards invalid payload coverage', () => {
  it('drops unsafe page capture timing from storage', () => {
    const parsed = parseStoredSettings({
      pagePackageCaptureTiming: { loadTimeoutMs: Number.POSITIVE_INFINITY, settleDelayMs: -1 },
    });
    expect(parsed.invalidFieldCount).toBe(1);
    expect(parsed.value.pagePackageCaptureTiming).toBeUndefined();
  });
  it('drops excessive export resource limits from storage', () => {
    const parsed = parseStoredSettings({
      exportResourceLimits: {
        maxFileCount: 101,
        maxFileSizeMiB: Number.POSITIVE_INFINITY,
        maxTotalSizeMiB: 201,
      },
    });
    expect(parsed.invalidFieldCount).toBe(1);
    expect(parsed.value.exportResourceLimits).toBeUndefined();
  });
  it('counts invalid toolbar, array, and context-menu fields independently', () => {
    expect(
      parseStoredSettings({
        contentToolbar: {
          displayMode: 'broken',
          compactMenus: true,
          position: { x: 'left', y: 5 },
        },
        viewportPresets: [{ id: 'broken' }],
        presets: 'broken-root',
        contextMenu: {
          enabled: 'yes',
          showScreenshots: true,
          showWindowResize: 'sometimes',
        },
      })
    ).toMatchObject({
      hasInvalidRoot: false,
      value: {},
    });
  });

  it('keeps invalid viewport arrays out of the stored value when every entry is malformed', () => {
    expect(
      parseStoredSettings({
        viewportPresets: [{ id: 'broken' }],
      })
    ).toMatchObject({
      hasInvalidRoot: false,
      value: {},
    });
  });

  it('rejects a partial or malformed persisted full-page preference object atomically', () => {
    expect(
      parseStoredSettings({
        fullPageCapture: { floatingElements: 'once', freezeMotion: true },
      })
    ).toMatchObject({ hasInvalidRoot: false, value: {} });
    expect(
      parseStoredSettings({
        fullPageCapture: {
          floatingElements: 'all',
          freezeMotion: true,
          preloadLazyContent: true,
        },
      })
    ).toMatchObject({ hasInvalidRoot: false, value: {} });
  });
});
