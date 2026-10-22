import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { runVideoRecordingSurfaceCommand } from './commands';
import type { VideoSettingsMutation } from '../../../../composition/persistence/capture-settings';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  load: vi.fn<() => Promise<VideoRecordingSettings>>(),
  switchPeer: vi.fn(async (_lease: unknown, _deviceId: string | null) => undefined),
  mutate: vi.fn<(mutation: VideoSettingsMutation) => Promise<VideoRecordingSettings>>(),
  update: vi.fn(),
  list: vi.fn(),
  validate: vi.fn(() => true),
  runtimeState: vi.fn(() => ({ status: 'IDLE' })),
  pendingStart: vi.fn(() => false),
  closePeer: vi.fn(async () => undefined),
  updateSurface: vi.fn(async () => null),
}));
vi.mock('../runtime/session-state', () => ({ getVideoRecordingRuntimeState: mocks.runtimeState }));
vi.mock('../../../../composition/persistence/capture-settings', () => ({
  loadVideoSettings: mocks.load,
  patchVideoSettings: mocks.patch,
  mutateVideoSettings: mocks.mutate,
}));
vi.mock('./surface-lease', () => ({
  ensureVideoRecordingSurfaceLeaseHydrated: async () => ({
    surfaceSessionId: 'surface-1',
    documentGeneration: 1,
    peerGeneration: 0,
  }),
  validateVideoRecordingSurfaceCapability: mocks.validate,
  updateVideoRecordingSurface: mocks.updateSurface,
}));
vi.mock('./snapshot', () => ({ createVideoRecordingSurfaceSnapshot: () => ({}) }));
vi.mock('./start', () => ({
  cancelSavedTabVideoRecordingStart: vi.fn(),
  isSavedTabVideoRecordingStartPending: mocks.pendingStart,
}));
vi.mock('./camera-peer', () => ({
  listVideoRecordingMediaDevices: mocks.list,
  closeVideoRecordingCameraPeerForLease: mocks.closePeer,
  switchVideoRecordingCameraPeerInput: mocks.switchPeer,
}));
vi.mock('../runtime/manager/controls', () => ({
  cancelRecordingStart: vi.fn(),
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
  stopRecording: vi.fn(),
  updateRecordingSettings: mocks.update,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validate.mockReturnValue(true);
  mocks.load.mockResolvedValue(DEFAULT_VIDEO_SETTINGS);
  mocks.switchPeer.mockReset().mockResolvedValue(undefined);
  mocks.runtimeState.mockReturnValue({ status: 'IDLE' });
  mocks.pendingStart.mockReturnValue(false);
  mocks.mutate.mockImplementation(async (mutation) => mutation(DEFAULT_VIDEO_SETTINGS));
  vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => ({ state: 'prompt' })) } });
});
afterEach(() => vi.unstubAllGlobals());

const base = {
  type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
  surfaceSessionId: 'surface-1',
  surfaceToken: 'token-1',
  capabilityEpoch: 1,
  documentGeneration: 1,
  recordingId: null,
} as const;

it('stores a disabled camera selection without requiring a preview peer', async () => {
  mocks.load.mockResolvedValue({ ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: false });
  mocks.switchPeer.mockRejectedValueOnce(new Error('Camera source peer is not active.'));
  await expect(
    runVideoRecordingSurfaceCommand(12, {
      ...base,
      command: { kind: 'select-webcam-device', deviceId: 'camera-b' },
    })
  ).resolves.toMatchObject({ success: true });
  expect(mocks.switchPeer).not.toHaveBeenCalled();
  expect(mocks.patch).toHaveBeenCalledExactlyOnceWith({ webcamDeviceId: 'camera-b' });
  expect(mocks.update).not.toHaveBeenCalled();
});

it('keeps source switching and rollback for an enabled idle camera', async () => {
  mocks.load.mockResolvedValue({
    ...DEFAULT_VIDEO_SETTINGS,
    webcamEnabled: true,
    webcamDeviceId: 'camera-a',
  });
  mocks.patch.mockRejectedValueOnce(new Error('storage refused'));
  await expect(
    runVideoRecordingSurfaceCommand(12, {
      ...base,
      command: { kind: 'select-webcam-device', deviceId: 'camera-b' },
    })
  ).rejects.toThrow('storage refused');
  expect(mocks.switchPeer.mock.calls.map(([, device]) => device)).toEqual(['camera-b', 'camera-a']);
});

it('refuses disabled-camera selection if authorization changes while loading settings', async () => {
  mocks.load.mockImplementationOnce(async () => {
    mocks.validate.mockReturnValue(false);
    return { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: false };
  });
  await expect(
    runVideoRecordingSurfaceCommand(12, {
      ...base,
      command: { kind: 'select-webcam-device', deviceId: 'camera-b' },
    })
  ).rejects.toThrow('Unauthorized or stale');
  expect(mocks.patch).not.toHaveBeenCalled();
  expect(mocks.switchPeer).not.toHaveBeenCalled();
});

it('merges camera placement with current geometry without acquiring or enabling media', async () => {
  await runVideoRecordingSurfaceCommand(12, {
    ...base,
    command: { kind: 'set-webcam-presentation-mode', mode: 'embedded' },
  });
  const mutation = mocks.mutate.mock.calls[0]![0];
  const current = {
    ...DEFAULT_VIDEO_SETTINGS,
    microphoneEnabled: false,
    webcamEnabled: false,
    webcamPresentation: { ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!, sizeFraction: 0.4 },
  };
  expect(mutation(current)).toEqual({
    ...current,
    webcamPresentation: { ...current.webcamPresentation, mode: 'embedded' },
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.closePeer).not.toHaveBeenCalled();
});

it('retires the enabled preview identity before returning a new placement', async () => {
  vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => ({ state: 'granted' })) } });
  const enabled = { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true };
  mocks.mutate.mockImplementationOnce(async (mutation) => mutation(enabled));
  await runVideoRecordingSurfaceCommand(12, {
    ...base,
    command: { kind: 'set-webcam-presentation-mode', mode: 'embedded' },
  });
  expect(mocks.closePeer).toHaveBeenCalledWith({
    surfaceSessionId: 'surface-1',
    documentGeneration: 1,
    peerGeneration: 0,
  });
  expect(mocks.updateSurface).toHaveBeenCalledWith('surface-1', { peerGeneration: 1 });
});

it.each(['PREPARING', 'COUNTDOWN', 'RECORDING', 'PAUSED', 'STOPPING'])(
  'rejects placement changes while runtime is %s with an idle surface identity',
  async (status) => {
    mocks.runtimeState.mockReturnValue({ status });
    await expect(
      runVideoRecordingSurfaceCommand(12, {
        ...base,
        command: { kind: 'set-webcam-presentation-mode', mode: 'embedded' },
      })
    ).rejects.toThrow('Camera placement cannot change during recording');
    expect(mocks.mutate).not.toHaveBeenCalled();
  }
);

it('rejects placement on a bound recording and retries an idle write after storage failure', async () => {
  const command = { kind: 'set-webcam-presentation-mode' as const, mode: 'embedded' as const };
  await expect(
    runVideoRecordingSurfaceCommand(12, { ...base, recordingId: 'recording-1', command })
  ).rejects.toThrow('Camera placement cannot change during recording');
  expect(mocks.mutate).not.toHaveBeenCalled();
  mocks.mutate.mockRejectedValueOnce(new Error('storage failed'));
  await expect(runVideoRecordingSurfaceCommand(12, { ...base, command })).rejects.toThrow(
    'storage failed'
  );
  mocks.mutate.mockImplementationOnce(async (mutation) => mutation(DEFAULT_VIDEO_SETTINGS));
  await expect(runVideoRecordingSurfaceCommand(12, { ...base, command })).resolves.toMatchObject({
    success: true,
  });
  expect(mocks.mutate).toHaveBeenCalledTimes(2);
  expect(mocks.update).not.toHaveBeenCalled();
});

it.each(['runtime-preparing', 'pending-start'] as const)(
  'refuses a queued placement write after %s begins',
  async (stage) => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = new Promise<void>((resolve) => {
      entered = resolve;
    });
    mocks.mutate.mockImplementationOnce(async (mutation) => {
      entered();
      await gate;
      return mutation(DEFAULT_VIDEO_SETTINGS);
    });
    const pending = runVideoRecordingSurfaceCommand(12, {
      ...base,
      command: { kind: 'set-webcam-presentation-mode', mode: 'embedded' },
    });
    await queued;
    if (stage === 'pending-start') mocks.pendingStart.mockReturnValue(true);
    else mocks.runtimeState.mockReturnValue({ status: 'PREPARING' });
    release();
    await expect(pending).rejects.toThrow('Camera placement cannot change during recording');
    expect(mocks.update).not.toHaveBeenCalled();
  }
);

it.each(['audioinput', 'videoinput'] as const)(
  'requires access before listing or enabling %s without effects',
  async (deviceKind) => {
    for (const requestPermission of [false, true]) {
      const result = await runVideoRecordingSurfaceCommand(12, {
        ...base,
        command: { kind: 'list-media-devices', deviceKind, requestPermission },
      });
      expect(result.result).toEqual({ mediaDevices: [], permissionRequired: true });
    }
    const enable = await runVideoRecordingSurfaceCommand(12, {
      ...base,
      command: {
        kind: deviceKind === 'audioinput' ? 'set-microphone-enabled' : 'set-webcam-enabled',
        enabled: true,
      },
    });
    expect(enable.result).toEqual({ result: 'permission-required', permissionRequired: true });
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  }
);

it('keeps full lease admission ahead of permission discovery', async () => {
  mocks.validate.mockReturnValue(false);
  await expect(
    runVideoRecordingSurfaceCommand(12, {
      ...base,
      command: { kind: 'list-media-devices', deviceKind: 'audioinput', requestPermission: false },
    })
  ).rejects.toThrow('Unauthorized or stale');
  expect(navigator.permissions.query).not.toHaveBeenCalled();
});
