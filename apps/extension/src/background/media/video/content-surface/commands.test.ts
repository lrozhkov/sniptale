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

it('persists idle gain without acquiring media and rolls back failed live persistence', async () => {
  mocks.patch.mockResolvedValue(undefined);
  await runVideoRecordingSurfaceCommand(12, {
    ...base,
    command: { kind: 'set-microphone-gain', gain: 1.5 },
  });
  expect(mocks.patch).toHaveBeenLastCalledWith({ microphoneGain: 1.5 });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.switchPeer).not.toHaveBeenCalled();
  mocks.update.mockResolvedValue({ result: 'accepted' });
  mocks.patch.mockRejectedValueOnce(new Error('storage refused'));
  await expect(
    runVideoRecordingSurfaceCommand(12, {
      ...base,
      recordingId: 'recording-1',
      command: { kind: 'set-microphone-gain', gain: 0 },
    })
  ).rejects.toThrow('storage refused');
  expect(mocks.update.mock.calls.map(([patch]) => patch)).toEqual([
    { microphoneGain: 0 },
    { microphoneGain: 1 },
  ]);
  await runVideoRecordingSurfaceCommand(12, {
    ...base,
    recordingId: 'recording-1',
    command: { kind: 'set-microphone-gain', gain: 2 },
  });
  expect(mocks.update).toHaveBeenLastCalledWith({ microphoneGain: 2 });
});

it('does not persist a refused live gain update', async () => {
  mocks.update.mockResolvedValueOnce({ result: 'refused', error: 'unavailable' });
  await expect(
    runVideoRecordingSurfaceCommand(12, {
      ...base,
      recordingId: 'recording-1',
      command: { kind: 'set-microphone-gain', gain: 0.5 },
    })
  ).rejects.toThrow('unavailable');
  expect(mocks.patch).not.toHaveBeenCalled();
});

it('serializes parallel microphone gain edits on the surface queue', async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  mocks.patch.mockImplementationOnce(() => held);
  const first = runVideoRecordingSurfaceCommand(12, {
    ...base,
    command: { kind: 'set-microphone-gain', gain: 0.5 },
  });
  await vi.waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
  const second = runVideoRecordingSurfaceCommand(12, {
    ...base,
    command: { kind: 'set-microphone-gain', gain: 1.5 },
  });
  expect(mocks.patch).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([first, second]);
  expect(mocks.patch.mock.calls.map(([patch]) => patch)).toEqual([
    { microphoneGain: 0.5 },
    { microphoneGain: 1.5 },
  ]);
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

it.each(['pending-start', 'active-recording', 'bound-recording'] as const)(
  'refuses output setup for %s before entering persistence',
  async (condition) => {
    if (condition === 'pending-start') mocks.pendingStart.mockReturnValue(true);
    if (condition === 'active-recording')
      mocks.runtimeState.mockReturnValue({ status: 'RECORDING' });
    await expect(
      runVideoRecordingSurfaceCommand(12, {
        ...base,
        ...(condition === 'bound-recording' ? { recordingId: 'recording-1' } : {}),
        command: { kind: 'select-quality-profile', profileId: 'builtin:compact' },
      })
    ).rejects.toThrow('Output settings cannot change');
    expect(mocks.mutate).not.toHaveBeenCalled();
  }
);

it('rechecks output setup authority after a queued media command completes', async () => {
  let release!: () => void;
  mocks.patch.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  const first = runVideoRecordingSurfaceCommand(12, {
    ...base,
    command: { kind: 'set-microphone-gain', gain: 1.5 },
  });
  await vi.waitFor(() => expect(mocks.patch).toHaveBeenCalledOnce());
  const queued = runVideoRecordingSurfaceCommand(12, {
    ...base,
    command: { kind: 'select-quality-profile', profileId: 'builtin:compact' },
  });
  const outcome = expect(queued).rejects.toThrow('Unauthorized or stale');
  mocks.validate.mockReturnValue(false);
  release();
  await first;
  await outcome;
  expect(mocks.mutate).not.toHaveBeenCalled();
});

it('refuses output mutation if Start takes admission while waiting for the persistence permit', async () => {
  mocks.mutate.mockImplementationOnce(async (mutation) => {
    mocks.pendingStart.mockReturnValue(true);
    return mutation(DEFAULT_VIDEO_SETTINGS);
  });
  await expect(
    runVideoRecordingSurfaceCommand(12, {
      ...base,
      command: { kind: 'set-output-profile', outputProfile: DEFAULT_VIDEO_SETTINGS.outputProfile },
    })
  ).rejects.toThrow('Output settings cannot change');
  expect(mocks.patch).not.toHaveBeenCalled();
});
