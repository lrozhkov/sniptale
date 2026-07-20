import { beforeEach, expect, it, vi } from 'vitest';
import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
  type VideoViewportPresetSelection,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  enableAnnotationsOrAbort,
  ensureOffscreenDocumentReadyOrAbort,
  resolveCaptureSourceForMode,
} from './transport.resolve';

beforeEach(() => {
  vi.clearAllMocks();
});

function createVideoSettings(): VideoRecordingSettings {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: true,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
  };
}

function createViewportPreset(): VideoViewportPresetSelection {
  return {
    height: 720,
    id: 'wide',
    label: 'Wide',
    width: 1280,
  };
}

it('aborts after offscreen setup when cancellation fires', async () => {
  const ensureReady = vi.fn(async () => undefined);
  const abortStart = vi.fn(() => true);

  await expect(
    ensureOffscreenDocumentReadyOrAbort('Recording tab video', 7, CaptureMode.TAB, {
      abortStart,
      ensureOffscreenDocumentReady: ensureReady,
      logger: { debug: vi.fn(), log: vi.fn() },
    })
  ).resolves.toBe(false);

  expect(ensureReady).toHaveBeenCalledWith('Recording tab video');
  expect(abortStart).toHaveBeenCalledWith(7, CaptureMode.TAB, 'offscreen setup');
});

it('returns null when annotation setup completes after cancellation', async () => {
  const enableAnnotations = vi.fn(async () => ({
    devicePixelRatio: 1,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    width: 1280,
  }));
  const abortStart = vi.fn(() => true);

  await expect(
    enableAnnotationsOrAbort(12, CaptureMode.TAB, createVideoSettings(), undefined, {
      abortStart,
      enableAnnotationsIfNeeded: enableAnnotations,
    })
  ).resolves.toBeNull();

  expect(enableAnnotations).toHaveBeenCalledOnce();
  expect(abortStart).toHaveBeenCalledWith(12, CaptureMode.TAB, 'annotation setup');
});

it('resolves capture sources through injected mode-specific dependencies', async () => {
  const resolveCaptureSource = vi.fn(async () => ({
    mode: CaptureMode.VIEWPORT_EMULATION,
    streamId: 'stream-2',
  }));

  await expect(
    resolveCaptureSourceForMode(
      17,
      { id: 17, url: 'https://example.test' } as chrome.tabs.Tab,
      CaptureMode.VIEWPORT_EMULATION,
      { ...createVideoSettings(), sourceCount: 3 },
      createViewportPreset(),
      {
        logger: { debug: vi.fn(), log: vi.fn() },
        resolveCaptureSource,
      }
    )
  ).resolves.toEqual({
    mode: CaptureMode.VIEWPORT_EMULATION,
    streamId: 'stream-2',
  });

  expect(resolveCaptureSource).toHaveBeenCalledWith({
    tabId: 17,
    tab: { id: 17, url: 'https://example.test' },
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    sourceCount: 3,
    viewportPreset: createViewportPreset(),
  });
});

it('omits viewport presets when capture mode resolution does not need them', async () => {
  const resolveCaptureSource = vi.fn(async () => ({
    mode: CaptureMode.TAB,
    streamId: 'stream-3',
  }));

  await expect(
    resolveCaptureSourceForMode(
      18,
      { id: 18, url: 'https://example.test/tab' } as chrome.tabs.Tab,
      CaptureMode.TAB,
      createVideoSettings(),
      undefined,
      {
        logger: { debug: vi.fn(), log: vi.fn() },
        resolveCaptureSource,
      }
    )
  ).resolves.toEqual({
    mode: CaptureMode.TAB,
    streamId: 'stream-3',
  });

  expect(resolveCaptureSource).toHaveBeenCalledWith({
    tabId: 18,
    tab: { id: 18, url: 'https://example.test/tab' },
    captureMode: CaptureMode.TAB,
  });
});

it('returns true after successful offscreen setup when cancellation does not fire', async () => {
  const ensureReady = vi.fn(async () => undefined);
  const abortStart = vi.fn(() => false);

  await expect(
    ensureOffscreenDocumentReadyOrAbort('Recording tab video', 7, CaptureMode.TAB, {
      abortStart,
      ensureOffscreenDocumentReady: ensureReady,
      logger: { debug: vi.fn(), log: vi.fn() },
    })
  ).resolves.toBe(true);
});

it('returns the annotation viewport when setup succeeds without cancellation', async () => {
  const viewport = {
    devicePixelRatio: 1,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    width: 1280,
  };
  const enableAnnotations = vi.fn(async () => viewport);
  const abortStart = vi.fn(() => false);

  await expect(
    enableAnnotationsOrAbort(12, CaptureMode.TAB, createVideoSettings(), undefined, {
      abortStart,
      enableAnnotationsIfNeeded: enableAnnotations,
    })
  ).resolves.toBe(viewport);
});
