import { describe, expect, it } from 'vitest';

import { parseStoredSettings } from './guards';

describe('settings guards valid payload coverage', () => {
  it('parses valid viewport presets and context-menu fields from storage payloads', () => {
    expect(
      parseStoredSettings({
        viewportPresets: [{ id: 'tablet', width: 768, height: 1024, label: 'Tablet' }],
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
      })
    ).toMatchObject({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      value: {
        viewportPresets: [{ id: 'tablet', width: 768, height: 1024, label: 'Tablet' }],
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
});
