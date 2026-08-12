// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoRecordingSurfaceSnapshot } from '@sniptale/runtime-contracts/video/types/messages.surface';

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  closePeer: vi.fn(),
  command: vi.fn(),
  disposeDrawing: vi.fn(),
  drawingClear: vi.fn(),
  getAutoHideDelay: vi.fn(() => 0),
  release: vi.fn(),
  requestAnswer: vi.fn(),
  runtimeListener: null as null | ((state: Record<string, unknown>) => void),
  setClockRunning: vi.fn(),
  setAutoHideDelay: vi.fn(),
  start: vi.fn(),
  surfaceListener: null as
    | null
    | ((snapshot: VideoRecordingSurfaceSnapshot, token?: string) => void),
}));

vi.mock('../transport/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../transport/client')>()),
  activateVideoRecordingSurface: mocks.activate,
  closeVideoRecordingCameraPeer: mocks.closePeer,
  releaseVideoRecordingSurface: mocks.release,
  requestVideoRecordingCameraAnswer: mocks.requestAnswer,
  sendVideoRecordingSurfaceCommand: mocks.command,
  startSavedTabVideoRecording: mocks.start,
  subscribeToVideoRecordingRuntimeState: vi.fn((listener) => {
    mocks.runtimeListener = listener;
    return vi.fn();
  }),
  subscribeToVideoRecordingSurfaceSnapshots: vi.fn((listener) => {
    mocks.surfaceListener = listener;
    return vi.fn();
  }),
}));

vi.mock('../../toolbar/video-recording/drawing-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../toolbar/video-recording/drawing-session')>()),
  createRecordingDrawingOwner: () => ({
    controller: { session: { clear: mocks.drawingClear } },
    dispose: mocks.disposeDrawing,
    getAutoHideDelay: mocks.getAutoHideDelay,
    setAutoHideDelay: mocks.setAutoHideDelay,
    setClockRunning: mocks.setClockRunning,
  }),
}));

import { useVideoRecordingSurfaceController } from './controller';

type Controller = ReturnType<typeof useVideoRecordingSurfaceController>;
const snapshot: VideoRecordingSurfaceSnapshot = {
  autoFadeDelay: 5,
  capabilityEpoch: 2,
  cursorSpotlightEnabled: true,
  documentGeneration: 1,
  duration: 4,
  entry: 'manual' as const,
  errorCode: null,
  lifecycle: 'ready' as const,
  microphoneDeviceId: 'mic-1',
  microphoneEnabled: true,
  peerGeneration: 3,
  recordingId: null,
  status: VideoRecordingStatus.IDLE,
  surfaceSessionId: 'surface-1',
  toolbarRequested: true,
  webcamDeviceId: 'cam-1',
  webcamEnabled: true,
  webcamPresentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
};

let controller: Controller;
let root: ReturnType<typeof createRoot>;
let onModeRequested = vi.fn<(enabled: boolean) => void>();
let onToolbarRequested = vi.fn<() => void>();

function Probe() {
  controller = useVideoRecordingSurfaceController({ onModeRequested, onToolbarRequested });
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.surfaceListener = null;
  mocks.runtimeListener = null;
  mocks.command.mockResolvedValue({});
  mocks.requestAnswer.mockResolvedValue('answer-sdp');
  onModeRequested = vi.fn<(enabled: boolean) => void>();
  onToolbarRequested = vi.fn<() => void>();
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
});

afterEach(() => {
  act(() => root.unmount());
});

it('projects surface snapshots and lifecycle clock ownership', () => {
  act(() => mocks.surfaceListener?.(snapshot, 'token-1'));
  expect(controller.state).toMatchObject({
    cameraEnabled: true,
    microphoneEnabled: true,
    surfaceSessionId: 'surface-1',
    spotlightEnabled: true,
  });
  expect(mocks.setAutoHideDelay).toHaveBeenCalledWith(5);
  expect(onModeRequested).toHaveBeenCalledWith(true);
  expect(onToolbarRequested).toHaveBeenCalledOnce();
  expect(mocks.setClockRunning).toHaveBeenLastCalledWith(false);
});

it('activates, releases, and starts through trusted content transport', async () => {
  mocks.activate.mockResolvedValue({ success: true, snapshot, surfaceToken: 'token-1' });
  await act(async () => expect(await controller.onActivate(new Event('click'))).toBe(true));
  await act(async () => expect(await controller.onDeactivate()).toBe(true));
  expect(mocks.release).toHaveBeenCalledOnce();
  expect(onModeRequested).toHaveBeenLastCalledWith(false);

  mocks.start.mockResolvedValue({ snapshot, surfaceToken: 'token-2' });
  await act(async () => controller.onStart(new Event('click')));
  expect(mocks.start).toHaveBeenCalledOnce();
});

it('rejects missing or unsuccessful activation without creating surface authority', async () => {
  await expect(controller.onActivate()).resolves.toBe(false);
  mocks.activate.mockResolvedValueOnce({ success: false });
  await expect(controller.onActivate(new Event('click'))).resolves.toBe(false);
  await expect(controller.onDeactivate()).resolves.toBe(false);
  expect(() => controller.onCameraOffer('offer')).toThrow('unavailable');
  expect(controller.onCameraPeerClose()).toBeUndefined();
  controller.onStart();
  expect(mocks.start).not.toHaveBeenCalled();
});

it('surfaces start failure and rolls back rejected media toggles', async () => {
  mocks.start.mockResolvedValue({ success: false, error: 'start failed' });
  await act(async () => controller.onStart(new Event('click')));
  expect(controller.state).toMatchObject({ error: 'start failed', phase: 'error' });

  act(() => mocks.surfaceListener?.(snapshot, 'token-1'));
  mocks.command.mockRejectedValueOnce(new Error('stale'));
  await expect(controller.onCameraEnabledChange(false)).rejects.toThrow('stale');
  await act(async () => undefined);
  expect(controller.state.cameraEnabled).toBe(true);
});

it('routes recording, media, drawing, spotlight, and camera peer actions', async () => {
  act(() => mocks.surfaceListener?.({ ...snapshot, recordingId: 'recording-1' }, 'token-1'));
  await controller.onCancelStart();
  await controller.onPause();
  await controller.onResume();
  await controller.onStop();
  await controller.onMicrophoneDeviceChange('mic-2');
  await controller.onCameraDeviceChange('cam-2');
  await controller.onCameraGeometryChange(snapshot.webcamPresentation);
  await expect(controller.onCameraOffer('offer-sdp')).resolves.toBe('answer-sdp');
  controller.onCameraPeerClose();
  act(() => {
    controller.onInteractionChange('drawing');
    controller.onSpotlightEnabledChange(true);
  });
  expect(mocks.command).toHaveBeenCalledTimes(7);
  expect(mocks.requestAnswer).toHaveBeenCalledWith(expect.any(Object), 'offer-sdp');
  expect(controller.state).toMatchObject({ interaction: 'drawing', spotlightEnabled: true });
});

it('projects runtime sync fallbacks and command snapshots after binding', async () => {
  act(() =>
    mocks.runtimeListener?.({
      captureMode: null,
      captureSource: null,
      countdownEndsAt: null,
      duration: 1,
      error: null,
      status: VideoRecordingStatus.IDLE,
      viewportPresetId: null,
    })
  );
  expect(controller.state.surfaceSessionId).toBeNull();

  act(() => mocks.surfaceListener?.(snapshot, 'token-1'));
  act(() =>
    mocks.runtimeListener?.({
      captureMode: null,
      captureSource: null,
      countdownEndsAt: null,
      duration: 12,
      error: null,
      liveMedia: {
        microphoneDeviceId: 'mic-2',
        microphoneEnabled: false,
        microphoneSelected: true,
        webcamDeviceId: 'cam-2',
        webcamEnabled: false,
        webcamSelected: true,
        webcamSettings: null,
      },
      status: VideoRecordingStatus.RECORDING,
      viewportPresetId: null,
    })
  );
  expect(controller.state).toMatchObject({
    durationSeconds: 12,
    microphoneDeviceId: 'mic-2',
    webcamDeviceId: 'cam-2',
  });

  act(() => mocks.surfaceListener?.({ ...snapshot, recordingId: null }, 'token-1'));
  act(() =>
    mocks.runtimeListener?.({
      captureMode: null,
      captureSource: null,
      countdownEndsAt: null,
      duration: 0,
      error: null,
      liveMedia: null,
      status: VideoRecordingStatus.IDLE,
      viewportPresetId: null,
    })
  );
  expect(controller.state).toMatchObject({ cameraEnabled: true, microphoneEnabled: true });

  mocks.command.mockResolvedValueOnce({ snapshot: { ...snapshot, microphoneEnabled: false } });
  await act(async () => controller.onMicrophoneEnabledChange(false));
  expect(controller.state.microphoneEnabled).toBe(false);
});

it('blocks mode exit after recording starts', async () => {
  act(() =>
    mocks.surfaceListener?.(
      {
        ...snapshot,
        recordingId: 'recording-1',
        status: VideoRecordingStatus.RECORDING,
      },
      'token-1'
    )
  );
  await expect(controller.onDeactivate()).resolves.toBe(false);
  expect(mocks.release).not.toHaveBeenCalled();
});
