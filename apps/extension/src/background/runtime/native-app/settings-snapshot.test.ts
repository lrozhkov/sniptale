import { beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoQuality,
  type NativeCaptureSettings,
} from '@sniptale/runtime-contracts/video/types/types';

const DEFAULT_NATIVE_SETTINGS = DEFAULT_VIDEO_SETTINGS.native as NativeCaptureSettings;

const mocks = vi.hoisted(() => ({
  getQuickActions: vi.fn(),
  loadVideoSettings: vi.fn(),
}));

vi.mock('../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/capture-settings')>()),
  loadVideoSettings: mocks.loadVideoSettings,
}));

vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/quick-actions')>()),
  getQuickActions: mocks.getQuickActions,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getQuickActions.mockResolvedValue([]);
});

it('normalizes missing native settings from video quality defaults', async () => {
  const { createNativeRequestedQualitySettings, normalizeNativeCaptureSettings } =
    await import('./settings-snapshot');

  const native = normalizeNativeCaptureSettings(undefined, VideoQuality.ULTRA);

  expect(native.video.advanced.audioBitrateKbps).toBe(192);
  expect(createNativeRequestedQualitySettings(native, VideoQuality.ULTRA)).toEqual(
    expect.objectContaining({ audioBitrateKbps: 192, quality: VideoQuality.ULTRA })
  );
});

it('loads stable native settings snapshots with revision and tray registry', async () => {
  mocks.loadVideoSettings.mockResolvedValue({
    ...DEFAULT_VIDEO_SETTINGS,
    native: {
      ...DEFAULT_NATIVE_SETTINGS,
      video: {
        ...DEFAULT_NATIVE_SETTINGS.video,
        advanced: {
          ...DEFAULT_NATIVE_SETTINGS.video.advanced,
          frameRate: 'auto',
          videoBitrateMbpsOverride: 16,
        },
      },
    },
    quality: VideoQuality.LOW,
  });
  const { loadNativeSettingsSnapshot } = await import('./settings-snapshot');

  await expect(loadNativeSettingsSnapshot()).resolves.toEqual(
    expect.objectContaining({
      native: expect.objectContaining({
        video: expect.objectContaining({
          advanced: expect.objectContaining({ frameRate: 'auto', videoBitrateMbpsOverride: 16 }),
        }),
      }),
      quality: VideoQuality.LOW,
      revision: expect.stringMatching(/^settings-sha256-/),
      schemaVersion: 1,
      trayActions: expect.objectContaining({ revision: expect.any(String) }),
    })
  );
});
