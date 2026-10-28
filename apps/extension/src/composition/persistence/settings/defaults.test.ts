import { beforeEach, describe, expect, it, vi } from 'vitest';

const { browserStorageSyncGetMock } = vi.hoisted(() => ({
  browserStorageSyncGetMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      remove: vi.fn(),
      set: vi.fn(),
    },
    sync: {
      get: browserStorageSyncGetMock,
      remove: vi.fn(),
      set: vi.fn(),
    },
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
  })),
}));

import { createDefaultSettings, loadSettings } from './index';

beforeEach(() => {
  browserStorageSyncGetMock.mockReset();
  browserStorageSyncGetMock.mockResolvedValue({});
});

describe('settings default graph', () => {
  it('clones nested default settings on each load', async () => {
    const firstSettings = await loadSettings();
    const secondSettings = await loadSettings();

    expect(firstSettings).toEqual(secondSettings);
    expect(firstSettings).not.toBe(secondSettings);
    expect(firstSettings.viewportPresets).not.toBe(secondSettings.viewportPresets);
    expect(firstSettings.contextMenu).not.toBe(secondSettings.contextMenu);
    expect(firstSettings.contentToolbar).not.toBe(secondSettings.contentToolbar);
    expect(firstSettings.fullPageCapture).not.toBe(secondSettings.fullPageCapture);
    expect(firstSettings.fullPageImage).not.toBe(secondSettings.fullPageImage);
    expect(firstSettings.voiceInput).not.toBe(secondSettings.voiceInput);
  });

  it('creates fresh nested defaults for direct default-settings consumers', () => {
    const firstSettings = createDefaultSettings();
    const secondSettings = createDefaultSettings();

    expect(firstSettings.viewportPresets).not.toBe(secondSettings.viewportPresets);
    expect(firstSettings.contextMenu).not.toBe(secondSettings.contextMenu);
    expect(firstSettings.contentToolbar).not.toBe(secondSettings.contentToolbar);
    expect(firstSettings.fullPageCapture).not.toBe(secondSettings.fullPageCapture);
    expect(firstSettings.fullPageImage).not.toBe(secondSettings.fullPageImage);
    expect(firstSettings.voiceInput).not.toBe(secondSettings.voiceInput);
  });

  it('uses the window-only system catalog and current size as the default', () => {
    const settings = createDefaultSettings();
    expect(settings.viewportPresets).toHaveLength(4);
    expect(settings.viewportPresets).toContainEqual(
      expect.objectContaining({
        height: 1080,
        id: 'system:window-full-hd',
        target: 'window',
        width: 1920,
      })
    );
    expect(settings.defaultViewportPresetId).toBeNull();
  });

  it('uses safe global full-page capture defaults', () => {
    expect(createDefaultSettings().fullPageCapture).toEqual({
      floatingElements: 'once',
      freezeMotion: true,
      preloadLazyContent: true,
    });
  });

  it('defaults reusable voice input to Russian local-first dictation', () => {
    expect(createDefaultSettings().voiceInput).toEqual({
      language: 'ru-RU',
      microphoneDeviceId: null,
      mode: 'local-first',
    });
  });
});

describe('new material category destinations', () => {
  it('defaults captures to drafts and web snapshots to permanent storage', () => {
    expect(createDefaultSettings().localStoragePolicy).toMatchObject({
      defaultDestination: 'temporary',
      recordingDestination: 'temporary',
      webSnapshotDestination: 'library',
    });
  });

  it.each(['temporary', 'library'] as const)(
    'retains the legacy %s capture destination for images and recordings',
    async (defaultDestination) => {
      browserStorageSyncGetMock.mockResolvedValue({
        sniptale_settings: { localStoragePolicy: { defaultDestination } },
      });
      expect((await loadSettings()).localStoragePolicy).toMatchObject({
        defaultDestination,
        recordingDestination: defaultDestination,
        webSnapshotDestination: 'library',
      });
    }
  );

  it('loads independent category choices without changing retention periods', async () => {
    browserStorageSyncGetMock.mockResolvedValue({
      sniptale_settings: {
        localStoragePolicy: {
          defaultDestination: 'temporary',
          recordingDestination: 'library',
          webSnapshotDestination: 'temporary',
          draftRetentionDays: 90,
          videoDraftRetentionDays: 14,
        },
      },
    });
    expect((await loadSettings()).localStoragePolicy).toMatchObject({
      defaultDestination: 'temporary',
      recordingDestination: 'library',
      webSnapshotDestination: 'temporary',
      draftRetentionDays: 90,
      videoDraftRetentionDays: 14,
    });
  });

  it('uses safe category defaults for malformed stored destination values', async () => {
    browserStorageSyncGetMock.mockResolvedValue({
      sniptale_settings: {
        localStoragePolicy: {
          defaultDestination: 'library',
          recordingDestination: 'delete',
          webSnapshotDestination: null,
        },
      },
    });
    expect((await loadSettings()).localStoragePolicy).toMatchObject({
      defaultDestination: 'library',
      recordingDestination: 'library',
      webSnapshotDestination: 'library',
    });
  });
});

it('inherits legacy image defaults for full-page captures without changing stored settings', async () => {
  const stored = { imageFormat: 'webp', imageQuality: 73 };
  browserStorageSyncGetMock.mockResolvedValue({ sniptale_settings: stored });
  expect((await loadSettings()).fullPageImage).toEqual({ imageFormat: 'webp', imageQuality: 73 });
  expect(stored).toEqual({ imageFormat: 'webp', imageQuality: 73 });
});

it.each([0, 200])(
  'bounds inherited legacy full-page quality %s before later patches',
  async (imageQuality) => {
    browserStorageSyncGetMock.mockResolvedValue({
      sniptale_settings: { imageFormat: 'jpeg', imageQuality },
    });
    expect((await loadSettings()).fullPageImage).toEqual({
      imageFormat: 'jpeg',
      imageQuality: 100,
    });
  }
);

it('keeps independent full-page image defaults when regular defaults differ', async () => {
  browserStorageSyncGetMock.mockResolvedValue({
    sniptale_settings: {
      imageFormat: 'jpeg',
      imageQuality: 81,
      fullPageImage: { imageFormat: 'webp', imageQuality: 64 },
    },
  });
  expect((await loadSettings()).fullPageImage).toEqual({ imageFormat: 'webp', imageQuality: 64 });
});
