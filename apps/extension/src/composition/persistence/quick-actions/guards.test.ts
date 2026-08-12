import { describe, expect, it } from 'vitest';

import { parseStoredQuickActions } from './guards';

describe('quick-action storage guards', () => {
  it('distinguishes missing storage from an invalid root', () => {
    expect(parseStoredQuickActions(undefined)).toEqual({
      actions: [],
      hasInvalidRoot: false,
      invalidEntryCount: 0,
    });
    expect(parseStoredQuickActions({})).toEqual({
      actions: [],
      hasInvalidRoot: true,
      invalidEntryCount: 0,
    });
  });

  it('normalizes legacy after-capture values and counts invalid entries', () => {
    expect(
      parseStoredQuickActions([
        {
          id: 'action-1',
          status: true,
          name: 'Action',
          icon: 'Camera',
          screenshotMode: 'visible',
          exitAfterCapture: true,
          afterCapture: 'download',
        },
        { id: 'broken-entry' },
      ])
    ).toEqual({
      actions: [
        expect.objectContaining({
          afterCapture: 'download_default',
          id: 'action-1',
        }),
      ],
      hasInvalidRoot: false,
      invalidEntryCount: 1,
    });
  });

  it('accepts the current viewport preset reference', () => {
    const result = parseStoredQuickActions([
      {
        id: 'action-1',
        status: true,
        name: 'Action',
        icon: 'Camera',
        screenshotMode: 'visible',
        exitAfterCapture: true,
        viewportPresetId: 'system:viewport-hd',
      },
    ]);

    expect(result).toEqual({
      actions: [expect.objectContaining({ viewportPresetId: 'system:viewport-hd' })],
      hasInvalidRoot: false,
      invalidEntryCount: 0,
    });
  });

  it('accepts a complete desktop action including library delivery and optional fields', () => {
    const result = parseStoredQuickActions([
      {
        afterCapture: 'save_to_library',
        bundledId: 'default-desktop-capture',
        delay: null,
        exitAfterCapture: false,
        hotkey: {
          altKey: false,
          ctrlKey: true,
          key: 'D',
          metaKey: false,
          shiftKey: true,
        },
        icon: 'Monitor',
        id: 'default-desktop-capture',
        imageFormat: 'webp',
        imageQuality: 80,
        name: 'Desktop capture',
        origin: 'bundled',
        screenshotMode: 'desktop',
        status: true,
        viewportPresetId: null,
      },
    ]);

    expect(result).toEqual({
      actions: [
        expect.objectContaining({
          afterCapture: 'save_to_library',
          screenshotMode: 'desktop',
        }),
      ],
      hasInvalidRoot: false,
      invalidEntryCount: 0,
    });
  });

  it('drops retired bundled actions so the current factory catalog can replace them', () => {
    const result = parseStoredQuickActions([
      {
        afterCapture: 'download_default',
        bundledId: 'default-fullscreen',
        exitAfterCapture: true,
        icon: 'MonitorDown',
        id: 'default-fullscreen',
        name: 'Legacy visible capture',
        origin: 'bundled',
        screenshotMode: 'visible',
        status: true,
      },
    ]);

    expect(result).toEqual({
      actions: [],
      hasInvalidRoot: false,
      invalidEntryCount: 1,
    });
  });

  it.each([{ viewportPresetId: 1280 }, { emulation: 'native' }])(
    'rejects retired or malformed viewport fields: %o',
    (invalidField) => {
      const result = parseStoredQuickActions([
        {
          id: 'action-1',
          status: true,
          name: 'Action',
          icon: 'Camera',
          screenshotMode: 'visible',
          exitAfterCapture: true,
          ...invalidField,
        },
      ]);

      expect(result).toEqual({
        actions: [],
        hasInvalidRoot: false,
        invalidEntryCount: 1,
      });
    }
  );
});
