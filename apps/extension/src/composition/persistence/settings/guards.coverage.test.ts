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
    target: 'viewport' as const,
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
          showSettings: false,
        },
        rawDiagnosticsEnabled: true,
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
          showSettings: false,
        },
        rawDiagnosticsEnabled: true,
        fullPageCapture: {
          floatingElements: 'hide',
          freezeMotion: false,
          preloadLazyContent: true,
        },
      },
    });
  });
});

describe('settings guards invalid payload coverage', () => {
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
