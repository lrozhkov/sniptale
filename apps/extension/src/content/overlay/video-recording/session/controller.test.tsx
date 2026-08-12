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
  subscribeRuntime: vi.fn(),
  subscribeSurface: vi.fn(),
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
  subscribeToVideoRecordingRuntimeState: mocks.subscribeRuntime.mockImplementation((listener) => {
    mocks.runtimeListener = listener;
    return vi.fn();
  }),
  subscribeToVideoRecordingSurfaceSnapshots: mocks.subscribeSurface.mockImplementation(
    (listener) => {
      mocks.surfaceListener = listener;
      return vi.fn();
    }
  ),
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function Probe() {
  controller = useVideoRecordingSurfaceController({
    onModeRequested: (enabled) => onModeRequested(enabled),
    onToolbarRequested: () => onToolbarRequested(),
  });
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.surfaceListener = null;
  mocks.runtimeListener = null;
  mocks.command.mockResolvedValue({ snapshot });
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
  expect(mocks.subscribeRuntime).toHaveBeenCalledOnce();
  expect(mocks.subscribeSurface).toHaveBeenCalledOnce();
});

it('activates, releases, and starts through trusted content transport', async () => {
  mocks.activate.mockResolvedValue({ success: true, snapshot, surfaceToken: 'token-1' });
  await act(async () => expect(await controller.onActivate(new Event('click'))).toBe(true));
  await act(async () => expect(await controller.onDeactivate()).toBe(true));
  expect(mocks.release).toHaveBeenCalledOnce();
  expect(controller.state.cameraEnabled).toBe(false);
  expect(onModeRequested).toHaveBeenLastCalledWith(false);

  onModeRequested.mockClear();
  onToolbarRequested.mockClear();
  act(() => mocks.surfaceListener?.(snapshot, 'stale-token'));
  expect(onModeRequested).not.toHaveBeenCalled();
  expect(onToolbarRequested).not.toHaveBeenCalled();

  mocks.start.mockResolvedValue({
    snapshot: { ...snapshot, surfaceSessionId: 'surface-2' },
    surfaceToken: 'token-2',
  });
  await act(async () => controller.onStart(new Event('click')));
  expect(mocks.start).toHaveBeenCalledOnce();
});

it('rejects missing or unsuccessful activation without creating surface authority', async () => {
  await expect(controller.onActivate()).resolves.toBe(false);
  mocks.activate.mockResolvedValueOnce({ success: false });
  await expect(controller.onActivate(new Event('click'))).rejects.toThrow(
    'Video recording toolbar is unavailable'
  );
  await expect(controller.onDeactivate()).resolves.toBe(true);
  expect(() => controller.onCameraOffer('offer')).toThrow('unavailable');
  expect(controller.onCameraPeerClose()).toBeUndefined();
  controller.onStart();
  expect(mocks.start).not.toHaveBeenCalled();
});

it('surfaces start failure and rolls back rejected media toggles', async () => {
  mocks.start.mockResolvedValue({ success: false, error: 'start failed' });
  await act(async () => controller.onStart(new Event('click')));
  expect(controller.state).toMatchObject({ error: expect.any(String), phase: 'error' });
  expect(controller.state.error).not.toBe('start failed');

  act(() => mocks.surfaceListener?.(snapshot, 'token-1'));
  mocks.command.mockRejectedValueOnce(new Error('stale'));
  await act(async () => {
    await expect(controller.onCameraEnabledChange(false)).rejects.toThrow('stale');
  });
  expect(controller.state.cameraEnabled).toBe(true);
});

it('waits for the authoritative camera snapshot before mounting preview', async () => {
  act(() => mocks.surfaceListener?.({ ...snapshot, webcamEnabled: false }, 'token-1'));
  const pending = createDeferred<{ snapshot: VideoRecordingSurfaceSnapshot }>();
  mocks.command.mockReturnValueOnce(pending.promise);

  let togglePromise!: Promise<void>;
  act(() => {
    togglePromise = controller.onCameraEnabledChange(true);
  });
  expect(controller.state.cameraEnabled).toBe(false);

  pending.resolve({
    snapshot: { ...snapshot, peerGeneration: snapshot.peerGeneration + 1, webcamEnabled: true },
  });
  await act(async () => togglePromise);
  expect(controller.state.cameraEnabled).toBe(true);
});

it('binds camera peer cleanup to the generation that created the peer', async () => {
  act(() => mocks.surfaceListener?.(snapshot, 'token-1'));
  const closeFirstPeer = controller.onCameraPeerClose;
  act(() =>
    mocks.surfaceListener?.({ ...snapshot, peerGeneration: snapshot.peerGeneration + 1 }, 'token-1')
  );

  await act(async () => closeFirstPeer());
  await act(async () => controller.onCameraPeerClose());

  expect(mocks.closePeer).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ peerGeneration: snapshot.peerGeneration })
  );
  expect(mocks.closePeer).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ peerGeneration: snapshot.peerGeneration + 1 })
  );
});

it('keeps camera peer callbacks stable across menu and duration snapshots', () => {
  act(() => mocks.surfaceListener?.(snapshot, 'token-1'));
  const offer = controller.onCameraOffer;
  const close = controller.onCameraPeerClose;

  act(() =>
    mocks.surfaceListener?.(
      { ...snapshot, duration: snapshot.duration + 1, microphoneDeviceId: 'mic-2' },
      'token-1'
    )
  );

  expect(controller.onCameraOffer).toBe(offer);
  expect(controller.onCameraPeerClose).toBe(close);
  expect(controller.state.microphoneDeviceId).toBe('mic-2');
});

it('refreshes same-peer capability credentials without restarting camera callbacks', async () => {
  act(() => mocks.surfaceListener?.(snapshot, 'token-1'));
  const offer = controller.onCameraOffer;
  const close = controller.onCameraPeerClose;
  act(() =>
    mocks.surfaceListener?.(
      { ...snapshot, capabilityEpoch: snapshot.capabilityEpoch + 1 },
      'token-2'
    )
  );

  expect(controller.onCameraOffer).toBe(offer);
  expect(controller.onCameraPeerClose).toBe(close);
  await controller.onCameraOffer('rotated-offer');
  await controller.onCameraPeerClose();
  expect(mocks.requestAnswer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      capabilityEpoch: snapshot.capabilityEpoch + 1,
      surfaceToken: 'token-2',
    }),
    'rotated-offer'
  );
  expect(mocks.closePeer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      capabilityEpoch: snapshot.capabilityEpoch + 1,
      surfaceToken: 'token-2',
    })
  );
});

it('leaves starting when the privileged start transport rejects', async () => {
  mocks.start.mockRejectedValue(new Error('runtime unavailable'));

  await act(async () => controller.onStart(new Event('click')));

  expect(controller.state).toMatchObject({ error: expect.any(String), phase: 'error' });
  expect(controller.state.error).not.toBe('runtime unavailable');
});

it('keeps a successful countdown cancellation idle when the original start settles later', async () => {
  act(() => mocks.surfaceListener?.(snapshot, 'token-1'));
  const pendingStart = createDeferred<{
    success: false;
    snapshot: VideoRecordingSurfaceSnapshot;
  }>();
  mocks.start.mockReturnValueOnce(pendingStart.promise);

  let startPromise!: Promise<void>;
  act(() => {
    startPromise = controller.onStart(new Event('click'));
  });
  await act(async () => controller.onCancelStart());
  expect(controller.state.phase).toBe('idle');

  pendingStart.resolve({ success: false, snapshot });
  await act(async () => startPromise);
  expect(controller.state).toMatchObject({ error: null, phase: 'idle' });
});

it('accepts the successful start when cancel loses the activation race', async () => {
  act(() => mocks.surfaceListener?.(snapshot, 'token-1'));
  const pendingStart = createDeferred<{
    success: true;
    snapshot: VideoRecordingSurfaceSnapshot;
    surfaceToken: string;
  }>();
  mocks.start.mockReturnValueOnce(pendingStart.promise);
  mocks.command.mockRejectedValueOnce(new Error('no active countdown'));

  let startPromise!: Promise<void>;
  act(() => {
    startPromise = controller.onStart(new Event('click'));
  });
  await act(async () => {
    await expect(controller.onCancelStart()).rejects.toThrow('no active countdown');
  });

  pendingStart.resolve({
    success: true,
    snapshot: { ...snapshot, recordingId: 'recording-1', status: VideoRecordingStatus.RECORDING },
    surfaceToken: 'token-1',
  });
  await act(async () => startPromise);
  expect(controller.state).toMatchObject({
    error: null,
    phase: 'recording',
    recordingId: 'recording-1',
  });
});

it('clears the command identity when runtime reports idle after stop', async () => {
  act(() =>
    mocks.surfaceListener?.(
      { ...snapshot, recordingId: 'recording-1', status: VideoRecordingStatus.RECORDING },
      'token-1'
    )
  );
  act(() =>
    mocks.runtimeListener?.({
      duration: 12,
      error: null,
      liveMedia: null,
      status: VideoRecordingStatus.IDLE,
    })
  );

  mocks.command.mockResolvedValueOnce({ snapshot: { ...snapshot, recordingId: null } });
  await act(async () => controller.onCameraEnabledChange(false));
  expect(mocks.command).toHaveBeenLastCalledWith(
    expect.objectContaining({ recordingId: null }),
    expect.objectContaining({ kind: 'set-webcam-enabled' })
  );
});

it('keeps media loading and camera peer callbacks stable across duration snapshots', () => {
  act(() => mocks.surfaceListener?.(snapshot, 'token-1'));
  const loadDevices = controller.onLoadMediaDevices;
  const cameraOffer = controller.onCameraOffer;
  const cameraPeerClose = controller.onCameraPeerClose;
  act(() =>
    mocks.runtimeListener?.({
      duration: snapshot.duration + 1,
      error: null,
      liveMedia: null,
      status: VideoRecordingStatus.RECORDING,
    })
  );
  expect(controller.onLoadMediaDevices).toBe(loadDevices);
  expect(controller.onCameraOffer).toBe(cameraOffer);
  expect(controller.onCameraPeerClose).toBe(cameraPeerClose);
});

it('routes recording, media, drawing, spotlight, and camera peer actions', async () => {
  act(() => mocks.surfaceListener?.({ ...snapshot, recordingId: 'recording-1' }, 'token-1'));
  await act(async () => {
    await controller.onCancelStart();
    await controller.onPause();
    await controller.onResume();
    await controller.onStop();
    await controller.onMicrophoneDeviceChange('mic-2');
    await controller.onCameraDeviceChange('cam-2');
    await controller.onCameraGeometryChange(snapshot.webcamPresentation);
  });
  await expect(controller.onCameraOffer('offer-sdp')).resolves.toBe('answer-sdp');
  controller.onCameraPeerClose();
  act(() => {
    controller.onInteractionChange('drawing');
    controller.onSpotlightEnabledChange(true);
  });
  expect(mocks.command).toHaveBeenCalledTimes(7);
  expect(mocks.command).toHaveBeenCalledWith(expect.any(Object), {
    kind: 'update-embedded-camera',
    appearance: {
      center: snapshot.webcamPresentation.center,
      cropOffset: snapshot.webcamPresentation.cropOffset,
      shape: snapshot.webcamPresentation.shape,
      sizeFraction: snapshot.webcamPresentation.sizeFraction,
    },
  });
  expect(mocks.requestAnswer).toHaveBeenCalledWith(expect.any(Object), 'offer-sdp');
  expect(controller.state).toMatchObject({ interaction: 'drawing', spotlightEnabled: true });
});

it('keeps the hot-swapped microphone selected from the command snapshot', async () => {
  act(() => mocks.surfaceListener?.({ ...snapshot, recordingId: 'recording-1' }, 'token-1'));
  mocks.command.mockResolvedValueOnce({
    snapshot: { ...snapshot, microphoneDeviceId: 'mic-2', recordingId: 'recording-1' },
  });

  await act(async () => controller.onMicrophoneDeviceChange('mic-2'));

  expect(controller.state.microphoneDeviceId).toBe('mic-2');
  expect(mocks.command).toHaveBeenCalledWith(expect.any(Object), {
    kind: 'select-microphone-device',
    deviceId: 'mic-2',
  });
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

it('hides the video surface controls without releasing an active recording', async () => {
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
  await expect(controller.onDeactivate()).resolves.toBe(true);
  expect(mocks.release).not.toHaveBeenCalled();
  expect(mocks.command).toHaveBeenLastCalledWith(expect.any(Object), {
    kind: 'set-toolbar-requested',
    enabled: false,
  });
  expect(onModeRequested).toHaveBeenLastCalledWith(false);
});
