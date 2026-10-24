// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import type { VideoRecordingSurfaceSnapshot } from '@sniptale/runtime-contracts/video/types/messages.surface';

const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  start: vi.fn(),
  surfaceListener: null as
    | null
    | ((snapshot: VideoRecordingSurfaceSnapshot, token?: string) => void),
  runtimeListener: null as null | ((state: VideoRecordingRuntimeState) => void),
}));
vi.mock('../transport/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../transport/client')>()),
  sendVideoRecordingSurfaceCommand: mocks.command,
  startSavedTabVideoRecording: mocks.start,
  subscribeToVideoRecordingSurfaceSnapshots: (listener: typeof mocks.surfaceListener) => {
    mocks.surfaceListener = listener;
    return vi.fn();
  },
  subscribeToVideoRecordingRuntimeState: (listener: typeof mocks.runtimeListener) => {
    mocks.runtimeListener = listener;
    return vi.fn();
  },
}));
vi.mock('../../toolbar/video-recording/drawing-session', () => ({
  createRecordingDrawingOwner: () => ({
    controller: { session: { clear: vi.fn() } },
    dispose: vi.fn(),
    getAutoHideDelay: () => 0,
    setAutoHideDelay: vi.fn(),
    setClockRunning: vi.fn(),
  }),
}));
vi.mock('./permission-frame', () => ({
  createRecordingPermissionFrameOwner: () => ({ request: vi.fn(), release: vi.fn() }),
  RecordingPermissionFrameError: class extends Error {},
}));
import { useVideoRecordingSurfaceController } from './controller';

const snapshot: VideoRecordingSurfaceSnapshot = {
  autoFadeDelay: 0,
  capabilityEpoch: 1,
  cursorSpotlightEnabled: false,
  documentGeneration: 1,
  duration: 0,
  entry: 'manual',
  errorCode: null,
  lifecycle: 'ready',
  microphoneDeviceId: null,
  microphoneEnabled: false,
  peerGeneration: 1,
  recordingId: null,
  status: VideoRecordingStatus.IDLE,
  surfaceSessionId: 'surface-1',
  toolbarRequested: true,
  webcamDeviceId: null,
  webcamEnabled: false,
  webcamPresentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
  outputSettings: {
    outputProfile: DEFAULT_VIDEO_SETTINGS.outputProfile,
    qualityProfileId: 'builtin:optimal',
    qualityProfiles: [],
  },
};
let controller: ReturnType<typeof useVideoRecordingSurfaceController>;
let root: ReturnType<typeof createRoot>;
function Probe() {
  controller = useVideoRecordingSurfaceController({
    onModeRequested: vi.fn(),
    onToolbarRequested: vi.fn(),
  });
  return null;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.command.mockResolvedValue({ snapshot });
  mocks.start.mockResolvedValue({ success: true, snapshot });
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  act(() => mocks.surfaceListener?.(snapshot, 'token-1'));
});
afterEach(() => act(() => root.unmount()));

it('keeps Start blocked until a selected profile is confirmed and permits recording after retry', async () => {
  const pending = deferred<{ snapshot: VideoRecordingSurfaceSnapshot }>();
  mocks.command.mockReturnValueOnce(pending.promise);
  let update!: Promise<void>;
  act(() => {
    update = controller.onQualityProfileChange('builtin:compact');
  });
  expect(controller.setupPending).toBe(true);
  await act(async () => expect(await controller.onStart(new Event('click'))).toBe('failed'));
  expect(mocks.start).not.toHaveBeenCalled();
  expect(controller.state.outputSettings?.qualityProfileId).toBe('builtin:optimal');
  const outputSettings = { ...snapshot.outputSettings!, qualityProfileId: 'builtin:compact' };
  await act(async () => {
    pending.resolve({ snapshot: { ...snapshot, outputSettings } });
    await update;
  });
  expect(controller.setupPending).toBe(false);
  expect(controller.state.outputSettings).toEqual(outputSettings);
  await act(async () => expect(await controller.onStart(new Event('click'))).toBe('started'));
  expect(mocks.start).toHaveBeenCalledOnce();
});

it('preserves accepted output setup after failure and retries the selected profile explicitly', async () => {
  mocks.command.mockRejectedValueOnce(new Error('settings refused'));
  await act(async () => {
    await expect(controller.onQualityProfileChange('builtin:compact')).rejects.toThrow(
      'settings refused'
    );
  });
  expect(controller.setupPending).toBe(false);
  expect(controller.state.phase).toBe('idle');
  expect(controller.state.error).toBeTruthy();
  expect(controller.state.outputSettings).toEqual(snapshot.outputSettings);
  mocks.command.mockResolvedValueOnce({
    snapshot: {
      ...snapshot,
      outputSettings: { ...snapshot.outputSettings!, qualityProfileId: 'builtin:compact' },
    },
  });
  await act(async () => controller.onQualityProfileChange('builtin:compact'));
  expect(controller.state.error).toBeNull();
  expect(controller.state.outputSettings?.qualityProfileId).toBe('builtin:compact');
});

it('sends manual output edits through the surface command without an optimistic profile change', async () => {
  const outputProfile = { ...DEFAULT_VIDEO_SETTINGS.outputProfile, frameRate: 60 as const };
  mocks.command.mockResolvedValueOnce({
    snapshot: {
      ...snapshot,
      outputSettings: { outputProfile, qualityProfileId: null, qualityProfiles: [] },
    },
  });
  await act(async () => controller.onOutputProfileChange(outputProfile));
  expect(mocks.command).toHaveBeenCalledWith(expect.objectContaining({ surfaceToken: 'token-1' }), {
    kind: 'set-output-profile',
    outputProfile,
  });
  expect(controller.state.outputSettings).toEqual({
    outputProfile,
    qualityProfileId: null,
    qualityProfiles: [],
  });
});

it('retains the chosen area target through microphone confirmation and cancellation', async () => {
  act(() => controller.onCaptureModeChange('TAB_CROP'));
  mocks.start.mockResolvedValueOnce({ success: true, confirmationRequired: true });
  await act(async () =>
    expect(await controller.onStart(new Event('click'))).toBe('confirmation-required')
  );
  expect(controller.captureMode).toBe('TAB_CROP');
  mocks.start.mockResolvedValueOnce({ success: false, failureCode: 'cancelled' });
  await act(async () =>
    expect(await controller.onStart(new Event('click'), { confirmedWithoutMicrophone: true })).toBe(
      'failed'
    )
  );
  expect(controller.captureMode).toBe('TAB_CROP');
  expect(controller.state.phase).toBe('error');
  expect(mocks.start).toHaveBeenLastCalledWith(expect.any(Event), {
    captureMode: 'TAB_CROP',
    confirmedWithoutMicrophone: true,
  });
  act(() => controller.onCaptureModeChange('TAB'));
  await act(async () =>
    controller.onStart(new Event('click'), { confirmedWithoutMicrophone: true })
  );
  expect(mocks.start).toHaveBeenLastCalledWith(expect.any(Event), {
    captureMode: 'TAB',
    confirmedWithoutMicrophone: true,
  });
});

it('refuses setup edits after recording preparation starts', async () => {
  act(() =>
    mocks.surfaceListener?.(
      { ...snapshot, recordingId: 'recording-1', status: VideoRecordingStatus.PREPARING },
      'token-1'
    )
  );
  act(() => controller.onCaptureModeChange('TAB_CROP'));
  expect(controller.captureMode).toBe('TAB');
  await expect(controller.onQualityProfileChange('builtin:compact')).rejects.toThrow();
  expect(mocks.command).not.toHaveBeenCalled();
});

it('preserves accepted setup through runtime projection and uses actual crop geometry', () => {
  act(() =>
    mocks.surfaceListener?.(
      { ...snapshot, recordingId: 'recording-1', status: VideoRecordingStatus.RECORDING },
      'token-1'
    )
  );
  const cropRegion = { x: 100, y: 80, width: 400, height: 240 };
  act(() =>
    mocks.runtimeListener?.({
      status: VideoRecordingStatus.RECORDING,
      duration: 4,
      captureMode: 'TAB_CROP',
      cropRegion,
      countdownEndsAt: null,
      captureSource: null,
      viewportPresetId: null,
      error: null,
    })
  );
  expect(controller.state).toMatchObject({
    outputSettings: snapshot.outputSettings,
    captureMode: 'TAB_CROP',
    cropRegion,
    durationSeconds: 4,
  });
  act(() =>
    mocks.runtimeListener?.({
      status: VideoRecordingStatus.IDLE,
      duration: 0,
      captureMode: null,
      cropRegion: null,
      countdownEndsAt: null,
      captureSource: null,
      viewportPresetId: null,
      error: null,
    })
  );
  expect(controller.state).toMatchObject({
    outputSettings: snapshot.outputSettings,
    captureMode: null,
    cropRegion: null,
    phase: 'idle',
  });
});

it('discards a delayed setup response after its surface has been replaced', async () => {
  const pending = deferred<{ snapshot: VideoRecordingSurfaceSnapshot }>();
  mocks.command.mockReturnValueOnce(pending.promise);
  let update!: Promise<void>;
  act(() => {
    update = controller.onQualityProfileChange('builtin:compact');
  });
  act(() => mocks.surfaceListener?.({ ...snapshot, surfaceSessionId: 'surface-2' }, 'token-2'));
  await act(async () => {
    pending.resolve({
      snapshot: {
        ...snapshot,
        outputSettings: { ...snapshot.outputSettings!, qualityProfileId: 'builtin:compact' },
      },
    });
    await update;
  });
  expect(controller.state.surfaceSessionId).toBe('surface-2');
  expect(controller.state.outputSettings?.qualityProfileId).toBe('builtin:optimal');
});

it.each(['before', 'during'] as const)(
  'preserves confirmed output setup when an unrelated request began %s the output write',
  async (ordering) => {
    const unrelated = deferred<{ snapshot: VideoRecordingSurfaceSnapshot }>();
    const output = deferred<{ snapshot: VideoRecordingSurfaceSnapshot }>();
    mocks.command.mockImplementation((_identity, command: { kind: string }) =>
      command.kind === 'select-quality-profile' ? output.promise : unrelated.promise
    );
    let updating!: Promise<void>;
    let refreshing!: Promise<void>;
    const refresh = () => {
      refreshing = controller.onSpotlightSettingsChange({
        cursorHaloEnabled: true,
        cursorDimmingEnabled: false,
        clickAnimationEnabled: false,
      });
    };
    if (ordering === 'before') act(refresh);
    act(() => {
      updating = controller.onQualityProfileChange('builtin:compact');
    });
    if (ordering === 'during') act(refresh);
    const outputSettings = {
      outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, resolution: '720P' as const },
      qualityProfileId: 'builtin:compact',
      qualityProfiles: [],
    };
    await act(async () => {
      output.resolve({ snapshot: { ...snapshot, outputSettings } });
      await updating;
    });
    expect(controller.state.outputSettings).toEqual(outputSettings);
    await act(async () => {
      unrelated.resolve({ snapshot: { ...snapshot, cursorSpotlightEnabled: true } });
      await refreshing;
    });
    expect(controller.state.outputSettings).toEqual(outputSettings);
    expect(controller.state.spotlightEnabled).toBe(true);
  }
);

it('preserves a successful retry when an unrelated request began during a failed output write', async () => {
  const failed = deferred<{ snapshot: VideoRecordingSurfaceSnapshot }>();
  const unrelated = deferred<{ snapshot: VideoRecordingSurfaceSnapshot }>();
  mocks.command.mockReturnValueOnce(failed.promise).mockReturnValueOnce(unrelated.promise);
  let updating!: Promise<void>;
  let refreshing!: Promise<void>;
  act(() => {
    updating = controller.onQualityProfileChange('builtin:compact');
  });
  act(() => {
    refreshing = controller.onAutoHideDelayChange(5);
  });
  await act(async () => {
    const rejection = expect(updating).rejects.toThrow('settings refused');
    failed.reject(new Error('settings refused'));
    await rejection;
  });
  expect(controller.state.outputSettings).toEqual(snapshot.outputSettings);
  expect(controller.setupPending).toBe(false);
  const outputSettings = { ...snapshot.outputSettings!, qualityProfileId: 'builtin:compact' };
  mocks.command.mockResolvedValueOnce({ snapshot: { ...snapshot, outputSettings } });
  await act(async () => controller.onQualityProfileChange('builtin:compact'));
  await act(async () => {
    unrelated.resolve({ snapshot: { ...snapshot, cursorSpotlightEnabled: true } });
    await refreshing;
  });
  expect(controller.state.outputSettings).toEqual(outputSettings);
  expect(controller.state.spotlightEnabled).toBe(true);
  expect(controller.state.error).toBeNull();
});

it('accepts fresh canonical output from queries dispatched after the output write completes', async () => {
  const selected = { ...snapshot.outputSettings!, qualityProfileId: 'builtin:compact' };
  mocks.command.mockResolvedValueOnce({ snapshot: { ...snapshot, outputSettings: selected } });
  await act(async () => controller.onQualityProfileChange('builtin:compact'));
  const changedElsewhere = { ...snapshot.outputSettings!, qualityProfileId: null };
  mocks.command.mockResolvedValueOnce({
    snapshot: { ...snapshot, outputSettings: changedElsewhere },
  });
  await act(async () => controller.onAutoHideDelayChange(5));
  expect(controller.state.outputSettings).toEqual(changedElsewhere);
});

it('does not merge old-surface output into a replacement surface response', async () => {
  const unrelated = deferred<{ snapshot: VideoRecordingSurfaceSnapshot }>();
  mocks.command.mockReturnValueOnce(unrelated.promise);
  let refreshing!: Promise<void>;
  act(() => {
    refreshing = controller.onAutoHideDelayChange(5);
  });
  const selected = { ...snapshot.outputSettings!, qualityProfileId: 'builtin:compact' };
  mocks.command.mockResolvedValueOnce({ snapshot: { ...snapshot, outputSettings: selected } });
  await act(async () => controller.onQualityProfileChange('builtin:compact'));
  const replacement = { ...snapshot.outputSettings!, qualityProfileId: 'builtin:maximum' };
  await act(async () => {
    unrelated.resolve({
      snapshot: { ...snapshot, surfaceSessionId: 'surface-2', outputSettings: replacement },
    });
    await refreshing;
  });
  expect(controller.state.surfaceSessionId).toBe('surface-2');
  expect(controller.state.outputSettings).toEqual(replacement);
});
