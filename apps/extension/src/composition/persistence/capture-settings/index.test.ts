import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CaptureMode,
  DEFAULT_VIDEO_CURSOR_EFFECTS,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoFrameRate,
  VideoQuality,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  runWithPersistentDataErasureBarrier,
  runWithExclusivePersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';

const { browserStorageLocalGetMock, browserStorageLocalSetMock } = vi.hoisted(() => ({
  browserStorageLocalGetMock: vi.fn(),
  browserStorageLocalSetMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', (_importOriginal) => ({
  browserStorage: {
    local: {
      get: browserStorageLocalGetMock,
      set: browserStorageLocalSetMock,
    },
  },
}));

import {
  loadVideoSettings,
  loadVideoUiState,
  mutateVideoSettings,
  patchVideoSettings,
  saveVideoUiState,
} from './index';

function resetVideoStorageMocks() {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  browserStorageLocalGetMock.mockResolvedValue({});
  browserStorageLocalSetMock.mockResolvedValue(undefined);
}

async function verifyVideoSettingsContracts() {
  browserStorageLocalGetMock.mockResolvedValueOnce({});
  await patchVideoSettings({ interactionDiagnosticsEnabled: true });

  expect(browserStorageLocalSetMock).toHaveBeenCalledWith(
    {
      sniptale_video_settings: {
        ...DEFAULT_VIDEO_SETTINGS,
        interactionDiagnosticsEnabled: true,
      },
    },
    expect.any(Object)
  );

  browserStorageLocalGetMock
    .mockResolvedValueOnce({
      sniptale_video_settings: {
        microphoneEnabled: true,
        webcamEnabled: true,
        webcamDeviceId: 'cam-2',
        systemAudioEnabled: false,
        outputProfile: {
          ...DEFAULT_VIDEO_SETTINGS.outputProfile,
          quality: VideoQuality.MEDIUM,
        },
        qualityProfileId: DEFAULT_VIDEO_SETTINGS.qualityProfileId,
        qualityProfiles: DEFAULT_VIDEO_SETTINGS.qualityProfiles,
        countdownSeconds: 'bad',
        autoFadeDelay: 8,
        interactionDiagnosticsEnabled: true,
      },
    })
    .mockResolvedValueOnce({
      sniptale_video_settings: 'corrupted',
    });

  await expect(loadVideoSettings()).resolves.toEqual({
    ...DEFAULT_VIDEO_SETTINGS,
    microphoneEnabled: true,
    webcamEnabled: true,
    webcamDeviceId: 'cam-2',
    systemAudioEnabled: false,
    outputProfile: {
      ...DEFAULT_VIDEO_SETTINGS.outputProfile,
      quality: VideoQuality.MEDIUM,
    },
    interactionDiagnosticsEnabled: true,
  });

  await expect(loadVideoSettings()).resolves.toEqual(DEFAULT_VIDEO_SETTINGS);
}

async function verifyVideoUiStateContracts() {
  const state = {
    captureMode: CaptureMode.SCREEN,
    viewportPresetId: 'preset-1',
  };

  await saveVideoUiState(state);

  expect(browserStorageLocalSetMock).toHaveBeenCalledWith({
    sniptale_video_ui_state: state,
  });

  browserStorageLocalGetMock
    .mockResolvedValueOnce({
      sniptale_video_ui_state: {
        captureMode: CaptureMode.TAB,
        viewportPresetId: 42,
      },
    })
    .mockResolvedValueOnce({
      sniptale_video_ui_state: null,
    });

  await expect(loadVideoUiState()).resolves.toEqual({
    captureMode: CaptureMode.TAB,
    viewportPresetId: null,
  });

  await expect(loadVideoUiState()).resolves.toEqual({
    captureMode: CaptureMode.TAB,
    viewportPresetId: null,
  });
}

describe('video', () => {
  beforeEach(resetVideoStorageMocks);

  it(
    'patches video settings and drops invalid persisted fields on load',
    verifyVideoSettingsContracts
  );
  it(
    'saves video UI state and falls back when persisted payload is invalid',
    verifyVideoUiStateContracts
  );

  it('loads output and custom-profile choices without repairing storage on read', async () => {
    const outputProfile = {
      codec: VideoOutputCodec.AVC,
      container: VideoOutputContainer.MP4,
      frameRate: VideoFrameRate.FPS30,
      quality: VideoQuality.MEDIUM,
      resolution: VideoResolutionPreset.P720,
    };
    const qualityProfiles = [
      {
        id: 'custom:review',
        name: 'Review',
        configuration: outputProfile,
      },
    ];
    browserStorageLocalGetMock.mockResolvedValue({
      sniptale_video_settings: {
        outputProfile,
        qualityProfileId: 'custom:review',
        qualityProfiles,
      },
    });

    await expect(loadVideoSettings()).resolves.toEqual({
      ...DEFAULT_VIDEO_SETTINGS,
      outputProfile,
      qualityProfileId: 'custom:review',
      qualityProfiles,
    });
    expect(browserStorageLocalSetMock).not.toHaveBeenCalled();
  });

  it('round-trips the last selected recording controls through canonical storage', async () => {
    let stored = DEFAULT_VIDEO_SETTINGS;
    browserStorageLocalGetMock.mockImplementation(async () => ({
      sniptale_video_settings: stored,
    }));
    browserStorageLocalSetMock.mockImplementation(async (items) => {
      stored = items.sniptale_video_settings as typeof DEFAULT_VIDEO_SETTINGS;
    });
    const outputProfile = {
      codec: VideoOutputCodec.AVC,
      container: VideoOutputContainer.MP4,
      frameRate: VideoFrameRate.FPS30,
      quality: VideoQuality.HIGH,
      resolution: VideoResolutionPreset.P1080,
    };

    await patchVideoSettings({
      countdownSeconds: 8,
      microphoneDeviceId: 'mic-last',
      microphoneEnabled: true,
      outputProfile,
      qualityProfileId: null,
      systemAudioEnabled: false,
      webcamDeviceId: 'cam-last',
      webcamEnabled: true,
    });

    await expect(loadVideoSettings()).resolves.toEqual({
      ...DEFAULT_VIDEO_SETTINGS,
      countdownSeconds: 8,
      microphoneDeviceId: 'mic-last',
      microphoneEnabled: true,
      outputProfile,
      qualityProfileId: null,
      systemAudioEnabled: false,
      webcamDeviceId: 'cam-last',
      webcamEnabled: true,
    });
  });

  it('resets the previous quality schema without migrating or repairing storage', async () => {
    browserStorageLocalGetMock.mockResolvedValue({
      sniptale_video_settings: {
        microphoneEnabled: true,
        quality: VideoQuality.LOW,
        systemAudioEnabled: false,
      },
    });

    await expect(loadVideoSettings()).resolves.toEqual(DEFAULT_VIDEO_SETTINGS);
    expect(browserStorageLocalSetMock).not.toHaveBeenCalled();
  });

  it('drains a remembered microphone choice before erasure removes that preference', async () => {
    let stored = { ...DEFAULT_VIDEO_SETTINGS };
    let releaseWrite!: () => void;
    let markWriteStarted!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      markWriteStarted = resolve;
    });
    const writeReleased = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    browserStorageLocalGetMock.mockImplementation(async () => ({
      sniptale_video_settings: stored,
    }));
    browserStorageLocalSetMock.mockImplementation(async (items) => {
      markWriteStarted();
      await writeReleased;
      stored = items.sniptale_video_settings as typeof DEFAULT_VIDEO_SETTINGS;
    });
    const remember = patchVideoSettings({
      warnWithoutMicrophone: false,
      recordingSurface: {
        toolbarEnabled: true,
        cursorSpotlightEnabled: true,
        cursorEffects: { ...DEFAULT_VIDEO_CURSOR_EFFECTS, haloSize: 66, haloColor: '#2563eb80' },
      },
    });
    await writeStarted;
    const erase = vi.fn(async () => {
      stored = { ...DEFAULT_VIDEO_SETTINGS };
    });
    const erasure = runWithPersistentDataErasureBarrier(erase);
    await Promise.resolve();
    expect(erase).not.toHaveBeenCalled();
    releaseWrite();
    await remember;
    await erasure;
    expect(erase).toHaveBeenCalledOnce();
    await expect(loadVideoSettings()).resolves.toMatchObject({ warnWithoutMicrophone: true });
    expect((await loadVideoSettings()).recordingSurface?.cursorEffects).toBeUndefined();
    await mutateVideoSettings((current) => ({
      ...current,
      recordingSurface: {
        toolbarEnabled: true,
        cursorSpotlightEnabled: true,
        cursorEffects: { ...DEFAULT_VIDEO_CURSOR_EFFECTS, haloSize: 77 },
      },
    }));
    expect((await loadVideoSettings()).recordingSurface?.cursorEffects?.haloSize).toBe(77);
  });

  it('serializes concurrent field and profile mutations without stale overwrites', async () => {
    let stored = DEFAULT_VIDEO_SETTINGS;
    let writeCount = 0;
    let releaseFirstWrite!: () => void;
    let markFirstWriteStarted!: () => void;
    const firstWriteStarted = new Promise<void>((resolve) => {
      markFirstWriteStarted = resolve;
    });
    const firstWriteReleased = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    browserStorageLocalGetMock.mockImplementation(async () => ({
      sniptale_video_settings: stored,
    }));
    browserStorageLocalSetMock.mockImplementation(async (items) => {
      writeCount += 1;
      if (writeCount === 1) {
        markFirstWriteStarted();
        await firstWriteReleased;
      }
      stored = items.sniptale_video_settings as typeof DEFAULT_VIDEO_SETTINGS;
    });
    const profile = {
      id: 'custom:concurrent',
      name: 'Concurrent',
      configuration: {
        ...DEFAULT_VIDEO_SETTINGS.outputProfile,
        quality: VideoQuality.MEDIUM,
      },
    };

    const preferenceWrite = patchVideoSettings({
      interactionDiagnosticsEnabled: true,
      warnWithoutMicrophone: false,
      recordingSurface: {
        toolbarEnabled: true,
        cursorSpotlightEnabled: true,
        cursorEffects: { ...DEFAULT_VIDEO_CURSOR_EFFECTS, haloSize: 66, haloColor: '#2563eb80' },
      },
    });
    await firstWriteStarted;
    const profileWrite = mutateVideoSettings((current) => ({
      ...current,
      qualityProfiles: [...current.qualityProfiles, profile],
    }));
    releaseFirstWrite();
    await Promise.all([preferenceWrite, profileWrite]);

    expect(stored.interactionDiagnosticsEnabled).toBe(true);
    expect(stored.warnWithoutMicrophone).toBe(false);
    expect(stored.qualityProfiles).toEqual([profile]);
    expect(stored.recordingSurface?.cursorEffects?.haloSize).toBe(66);
    expect(stored.recordingSurface?.cursorEffects?.haloColor).toBe('#2563eb80');
    await expect(loadVideoSettings()).resolves.toMatchObject({
      recordingSurface: { cursorEffects: { haloSize: 66, haloColor: '#2563eb80' } },
    });
    await expect(loadVideoSettings()).resolves.toMatchObject({ warnWithoutMicrophone: false });
  });

  it('merges a granted microphone enable with a concurrent device and preference writer', async () => {
    let stored = { ...DEFAULT_VIDEO_SETTINGS, microphoneEnabled: false, webcamEnabled: false };
    let releaseFirstWrite!: () => void;
    let markFirstWriteStarted!: () => void;
    const firstWriteStarted = new Promise<void>((resolve) => {
      markFirstWriteStarted = resolve;
    });
    const firstWriteReleased = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let writeCount = 0;
    browserStorageLocalGetMock.mockImplementation(async () => ({
      sniptale_video_settings: stored,
    }));
    browserStorageLocalSetMock.mockImplementation(async (items) => {
      writeCount += 1;
      if (writeCount === 1) {
        markFirstWriteStarted();
        await firstWriteReleased;
      }
      stored = items.sniptale_video_settings as typeof stored;
    });
    const preferenceWrite = patchVideoSettings({
      microphoneDeviceId: 'new-mic',
      webcamDeviceId: 'new-camera',
      warnWithoutMicrophone: false,
    });
    await firstWriteStarted;
    const grantWrite = mutateVideoSettings((current) => ({ ...current, microphoneEnabled: true }));
    releaseFirstWrite();
    await Promise.all([preferenceWrite, grantWrite]);
    expect(stored).toEqual({
      ...DEFAULT_VIDEO_SETTINGS,
      microphoneEnabled: true,
      webcamEnabled: false,
      microphoneDeviceId: 'new-mic',
      webcamDeviceId: 'new-camera',
      warnWithoutMicrophone: false,
    });
  });
});

describe('cursor effect persistence', () => {
  beforeEach(resetVideoStorageMocks);

  it('preserves accepted cursor effects after a failed write and accepts an explicit retry', async () => {
    let stored = {
      ...DEFAULT_VIDEO_SETTINGS,
      recordingSurface: {
        toolbarEnabled: true,
        cursorSpotlightEnabled: true,
        cursorEffects: { ...DEFAULT_VIDEO_CURSOR_EFFECTS, clickSize: 55 },
      },
    };
    browserStorageLocalGetMock.mockImplementation(async () => ({
      sniptale_video_settings: stored,
    }));
    browserStorageLocalSetMock.mockRejectedValueOnce(new Error('storage unavailable'));
    const update = () =>
      mutateVideoSettings((current) => ({
        ...current,
        recordingSurface: {
          ...stored.recordingSurface,
          cursorEffects: { ...DEFAULT_VIDEO_CURSOR_EFFECTS, clickSize: 75 },
        },
      }));
    await expect(update()).rejects.toThrow('storage unavailable');
    expect((await loadVideoSettings()).recordingSurface?.cursorEffects?.clickSize).toBe(55);
    browserStorageLocalSetMock.mockImplementation(async (items) => {
      stored = items.sniptale_video_settings as typeof stored;
    });
    await update();
    expect((await loadVideoSettings()).recordingSurface?.cursorEffects?.clickSize).toBe(75);
  });

  it('orders a delayed cursor edit before an exclusive settings replacement', async () => {
    let stored = { ...DEFAULT_VIDEO_SETTINGS };
    let releaseWrite!: () => void;
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    browserStorageLocalGetMock.mockImplementation(async () => ({
      sniptale_video_settings: stored,
    }));
    browserStorageLocalSetMock.mockImplementation(async (items) => {
      notifyStarted();
      await released;
      stored = items.sniptale_video_settings as typeof stored;
    });
    const edit = mutateVideoSettings((current) => ({
      ...current,
      recordingSurface: {
        toolbarEnabled: true,
        cursorSpotlightEnabled: true,
        cursorEffects: { ...DEFAULT_VIDEO_CURSOR_EFFECTS, haloSize: 66 },
      },
    }));
    await started;
    const replace = vi.fn(() => {
      stored = { ...DEFAULT_VIDEO_SETTINGS };
    });
    const replacement = runWithExclusivePersistenceMutationPermit(replace);
    await Promise.resolve();
    expect(replace).not.toHaveBeenCalled();
    releaseWrite();
    await Promise.all([edit, replacement]);
    expect(replace).toHaveBeenCalledOnce();
    expect((await loadVideoSettings()).recordingSurface?.cursorEffects).toBeUndefined();
  });
});
