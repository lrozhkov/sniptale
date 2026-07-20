import { afterEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
import {
  resetPopupRuntimeServicesForTests,
  setPopupRuntimeServicesForTests,
} from '../../runtime/services';
import { invalidateViewportPresetApplyGeneration } from '../../runtime/viewport-apply-generation';
import {
  createPopupAppShellRuntime,
  type PopupRuntimeStateOverrides,
} from '../test-support/runtime';
import { createPopupVideoSetupHandlers } from './handlers';

const sendRuntimeMessageMock = vi.fn();

function createDeferred<T = unknown>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function createRuntime(overrides: PopupRuntimeStateOverrides = {}): PopupVideoSetupRuntime {
  return createPopupAppShellRuntime({
    galleryStatus: null,
    selectedPresetId: null,
    ...overrides,
  });
}

function stubRuntimeMessaging() {
  sendRuntimeMessageMock.mockResolvedValue({ success: true });
  setPopupRuntimeServicesForTests({
    messaging: {
      sendRuntimeMessage: sendRuntimeMessageMock,
      sendTabMessage: vi.fn(),
    },
  });
}

afterEach(() => {
  resetPopupRuntimeServicesForTests();
  vi.clearAllMocks();
});

it('clears errors before changing capture mode and applying a preset viewport', async () => {
  const runtime = createRuntime();
  stubRuntimeMessaging();
  const handlers = createPopupVideoSetupHandlers(runtime);

  handlers.onCaptureModeChange(CaptureMode.SCREEN);
  await handlers.onPresetChange('preset-1');

  expect(runtime.recording.clearStartError).toHaveBeenCalledTimes(2);
  expect(runtime.recording.setVideoCaptureMode).toHaveBeenCalledWith(CaptureMode.SCREEN);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: MessageType.SET_VIEWPORT,
    tabId: 1,
    width: 1280,
    height: 720,
  });
  expect(runtime.recording.setSelectedPresetId).toHaveBeenCalledWith('preset-1');
  expect(runtime.recording.setAppliedViewportPresetId).toHaveBeenCalledWith('preset-1');
  expect(runtime.recording.setAppliedViewportTabId).toHaveBeenCalledWith(1);
  expect(runtime.recording.setVideoSettings).not.toHaveBeenCalled();
});

it('clears viewport emulation before committing native preset selection', async () => {
  const runtime = createRuntime();
  stubRuntimeMessaging();
  const handlers = createPopupVideoSetupHandlers(runtime);

  await handlers.onPresetChange(null);

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: MessageType.SET_VIEWPORT,
    tabId: 1,
  });
  expect(runtime.recording.setSelectedPresetId).toHaveBeenCalledWith(null);
  expect(runtime.recording.setAppliedViewportPresetId).toHaveBeenCalledWith(null);
  expect(runtime.recording.setAppliedViewportTabId).toHaveBeenCalledWith(null);
});

it('omits null tab id when applying viewport through the active tab route fallback', async () => {
  const runtime = createRuntime({
    activeTabCapabilities: {
      ...createRuntime().environment.activeTabCapabilities,
      tabId: null,
    },
  });
  stubRuntimeMessaging();
  const handlers = createPopupVideoSetupHandlers(runtime);

  await handlers.onPresetChange('preset-1');

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: MessageType.SET_VIEWPORT,
    width: 1280,
    height: 720,
  });
  expect(runtime.recording.setAppliedViewportPresetId).toHaveBeenCalledWith('preset-1');
  expect(runtime.recording.setAppliedViewportTabId).toHaveBeenCalledWith(null);
});

it('does not commit preset selection when viewport apply fails', async () => {
  const runtime = createRuntime();
  stubRuntimeMessaging();
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('blocked'));
  const handlers = createPopupVideoSetupHandlers(runtime);

  await handlers.onPresetChange('preset-1');

  expect(runtime.recording.setSelectedPresetId).not.toHaveBeenCalled();
  expect(runtime.recording.setAppliedViewportPresetId).not.toHaveBeenCalled();
  expect(runtime.recording.setAppliedViewportTabId).not.toHaveBeenCalled();
  expect(runtime.recording.setStartError).toHaveBeenCalledWith('blocked');
});

it('ignores stale preset apply success after a newer native selection commits', async () => {
  const runtime = createRuntime();
  const firstApply = createDeferred();
  const secondApply = createDeferred();
  stubRuntimeMessaging();
  sendRuntimeMessageMock
    .mockReturnValueOnce(firstApply.promise)
    .mockReturnValueOnce(secondApply.promise);
  const handlers = createPopupVideoSetupHandlers(runtime);

  const firstSelection = handlers.onPresetChange('preset-1');
  const secondSelection = handlers.onPresetChange(null);

  secondApply.resolve({ success: true });
  await secondSelection;
  firstApply.resolve({ success: true });
  await firstSelection;

  expect(runtime.recording.setSelectedPresetId).toHaveBeenCalledTimes(1);
  expect(runtime.recording.setSelectedPresetId).toHaveBeenCalledWith(null);
  expect(runtime.recording.setAppliedViewportPresetId).toHaveBeenCalledTimes(1);
  expect(runtime.recording.setAppliedViewportPresetId).toHaveBeenCalledWith(null);
  expect(runtime.recording.setAppliedViewportTabId).toHaveBeenCalledTimes(1);
  expect(runtime.recording.setAppliedViewportTabId).toHaveBeenCalledWith(null);
  expect(runtime.recording.setStartError).not.toHaveBeenCalled();
});

it('ignores stale preset apply failure after a newer selection commits', async () => {
  const runtime = createRuntime({
    home: {
      viewportPresets: [
        { id: 'preset-1', label: '', width: 1280, height: 720 },
        { id: 'preset-2', label: '', width: 1440, height: 900 },
      ],
    },
  });
  const firstApply = createDeferred();
  const secondApply = createDeferred();
  stubRuntimeMessaging();
  sendRuntimeMessageMock
    .mockReturnValueOnce(firstApply.promise)
    .mockReturnValueOnce(secondApply.promise);
  const handlers = createPopupVideoSetupHandlers(runtime);

  const firstSelection = handlers.onPresetChange('preset-1');
  const secondSelection = handlers.onPresetChange('preset-2');

  secondApply.resolve({ success: true });
  await secondSelection;
  firstApply.reject(new Error('older failure'));
  await firstSelection;

  expect(runtime.recording.setSelectedPresetId).toHaveBeenCalledTimes(1);
  expect(runtime.recording.setSelectedPresetId).toHaveBeenCalledWith('preset-2');
  expect(runtime.recording.setAppliedViewportPresetId).toHaveBeenCalledTimes(1);
  expect(runtime.recording.setAppliedViewportPresetId).toHaveBeenCalledWith('preset-2');
  expect(runtime.recording.setAppliedViewportTabId).toHaveBeenCalledTimes(1);
  expect(runtime.recording.setAppliedViewportTabId).toHaveBeenCalledWith(1);
  expect(runtime.recording.setStartError).not.toHaveBeenCalled();
});

it('ignores preset apply success after lifecycle invalidates viewport authority', async () => {
  const runtime = createRuntime();
  const apply = createDeferred();
  stubRuntimeMessaging();
  sendRuntimeMessageMock.mockReturnValueOnce(apply.promise);
  const handlers = createPopupVideoSetupHandlers(runtime);

  const selection = handlers.onPresetChange('preset-1');

  invalidateViewportPresetApplyGeneration();
  apply.resolve({ success: true });
  await selection;

  expect(runtime.recording.setSelectedPresetId).not.toHaveBeenCalled();
  expect(runtime.recording.setAppliedViewportPresetId).not.toHaveBeenCalled();
  expect(runtime.recording.setAppliedViewportTabId).not.toHaveBeenCalled();
  expect(runtime.recording.setStartError).not.toHaveBeenCalled();
});

it('patches media settings and toggles media devices through the runtime', async () => {
  const runtime = createRuntime();
  const handlers = createPopupVideoSetupHandlers(runtime);
  const patch: Partial<VideoRecordingSettings> = {
    microphoneDeviceId: 'mic-2',
  };

  handlers.onMicrophoneDeviceChange('mic-2');
  handlers.onWebcamDeviceChange('cam-2');
  handlers.onSettingsChange(patch);
  handlers.onToggleMicrophone();
  handlers.onToggleWebcam();

  expect(runtime.recording.setVideoSettings).toHaveBeenNthCalledWith(1, expect.any(Function));
  expect(runtime.recording.setVideoSettings).toHaveBeenNthCalledWith(2, expect.any(Function));
  expect(runtime.recording.setVideoSettings).toHaveBeenNthCalledWith(3, expect.any(Function));
  expect(runtime.recording.handleToggleMicrophone).toHaveBeenCalledTimes(1);
  expect(runtime.recording.handleToggleWebcam).toHaveBeenCalledTimes(1);
});

it('preserves controlled cursor settings while changing capture modes', () => {
  const runtime = createRuntime({
    videoCaptureMode: CaptureMode.SCREEN,
  });
  const handlers = createPopupVideoSetupHandlers(runtime);

  handlers.onCaptureModeChange(CaptureMode.SCREEN);
  handlers.onSettingsChange({
    controlledCursorCaptureEnabled: true,
  });

  const applyPatch = vi.mocked(runtime.recording.setVideoSettings).mock.calls[0]?.[0] as (
    settings: VideoRecordingSettings
  ) => VideoRecordingSettings;

  expect(
    applyPatch({
      ...DEFAULT_VIDEO_SETTINGS,
      controlledCursorCaptureEnabled: false,
    })
  ).toEqual(
    expect.objectContaining({
      controlledCursorCaptureEnabled: true,
    })
  );
});

it('forces webcam recording settings and disables incompatible options for camera mode', () => {
  const runtime = createRuntime({
    videoSettings: {
      ...DEFAULT_VIDEO_SETTINGS,
      controlledCursorCaptureEnabled: true,
      diagnosticsEnabled: true,
      systemAudioEnabled: true,
      webcamDeviceId: null,
      webcamEnabled: false,
    },
    webcamDevices: [{ deviceId: 'cam-2', label: 'Camera 2' }],
  });
  const handlers = createPopupVideoSetupHandlers(runtime);

  handlers.onCaptureModeChange(CaptureMode.CAMERA);

  expect(runtime.recording.setVideoCaptureMode).toHaveBeenCalledWith(CaptureMode.CAMERA);
  const applyPatch = vi.mocked(runtime.recording.setVideoSettings).mock.calls[0]?.[0] as (
    settings: VideoRecordingSettings
  ) => VideoRecordingSettings;

  expect(applyPatch(runtime.recording.videoSettings)).toEqual(
    expect.objectContaining({
      controlledCursorCaptureEnabled: false,
      diagnosticsEnabled: false,
      sourceCount: 1,
      systemAudioEnabled: false,
      webcamDeviceId: 'cam-2',
      webcamEnabled: true,
    })
  );
});
