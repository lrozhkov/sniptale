import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { installBackgroundRuntimeMessagingMock } from '../../../../../routing-contracts/runtime-messaging/mock';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { runWithExclusivePersistenceMutationPermit } from '../../../../../../composition/persistence/infrastructure/mutation-barrier';

const boundary = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  clearGrant: vi.fn(),
  releaseSurface: vi.fn(),
  requestStop: vi.fn(),
}));

vi.mock('../../../offscreen-recording-stop', async (original) => ({
  ...(await original<typeof import('../../../offscreen-recording-stop')>()),
  requestBoundOffscreenRecordingStop: boundary.requestStop,
}));
vi.mock('../../manager/controls.stop/effects', () => ({
  runStopSideEffects: vi.fn().mockResolvedValue(undefined),
}));

vi.mock(
  '../../../../../../composition/persistence/infrastructure/browser-storage',
  async (original) => ({
    ...(await original<
      typeof import('../../../../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      session: {
        isAvailable: () => true,
        get: boundary.get,
        set: boundary.set,
        remove: boundary.remove,
      },
    },
  })
);
vi.mock('../../camera-recorder-control', async (original) => ({
  ...(await original<typeof import('../../camera-recorder-control')>()),
  clearCameraRecorderControlGrant: boundary.clearGrant,
}));
vi.mock('../../../capture-surface', async (original) => ({
  ...(await original<typeof import('../../../capture-surface')>()),
  releaseVideoCaptureSurface: boundary.releaseSurface,
}));
vi.mock('../../session-state/badge-state', () => ({ applyBadgeState: vi.fn() }));
vi.mock('../../../content-surface/runtime-state-sync', () => ({
  publishVideoRecordingSurfaceRuntimeState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../../../platform/runtime-messaging', async (original) => ({
  ...(await original<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: vi.fn().mockResolvedValue(undefined),
}));

import {
  activateVideoRecordingLease,
  clearActiveVideoRecordingLease,
  hydrateActiveVideoRecordingLease,
  issuePreparedVideoRecordingLease,
  resetActiveVideoRecordingLeaseForTests,
  updateVideoRecordingTerminal,
  getActiveVideoRecordingLeaseSnapshot,
  validateRecordingControlCapability,
  validateTerminalRecordingStopCapability,
} from '../../../recording-control-lease';
import {
  beginVideoRecordingPreparation,
  markVideoRecordingPreparationSettled,
  getVideoRecordingId,
  finishVideoRecordingStop,
  isVideoRecordingStopInProgress,
  resetCompletedVideoRecordingSession,
  setVideoRecordingId,
  setVideoRecordingTabId,
} from '../../../session-state';
import {
  getVideoRecordingRuntimeState,
  resetVideoRecordingRuntimeState,
  setVideoRecordingRuntimeState,
} from '../../session-state/service/runtime-state-service';
import {
  handleRecordingDurationUpdated,
  handleOffscreenRecordingStopped,
  handleRecordingState,
  handleOffscreenRecordingStarted,
  handleOffscreenRecordingPaused,
  handleOffscreenRecordingResumed,
} from './recording-state';
import { completeVideoRecording } from '../../recording-completion';
import { stopRecording } from '../../manager/controls.stop/flow';
import { handleOffscreenError } from './offscreen-lifecycle';

let stored: Record<string, unknown>;
const recordingId = 'terminal-recording-a';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function readState(): Promise<unknown> {
  return new Promise((resolve) => {
    handleRecordingState(resolve);
  });
}

async function start(mode: CaptureMode) {
  setVideoRecordingId(recordingId);
  setVideoRecordingTabId(mode === CaptureMode.CAMERA ? null : 17);
  await issuePreparedVideoRecordingLease({
    captureMode: mode,
    ownerSenderUrl: 'chrome-extension://test/popup.html',
    surfaceBinding: { generation: 1, streamInstanceId: 'source-a' },
  });
  await activateVideoRecordingLease({ recordingId, generation: 1, streamInstanceId: 'source-a' });
  setVideoRecordingRuntimeState({ captureMode: mode, status: VideoRecordingStatus.STOPPING });
}

beforeEach(() => {
  vi.clearAllMocks();
  stored = {};
  boundary.get.mockImplementation(async () => structuredClone(stored));
  boundary.set.mockImplementation(async (values: Record<string, unknown>) => {
    Object.assign(stored, structuredClone(values));
  });
  boundary.remove.mockImplementation(async (key: string) => {
    delete stored[key];
  });
  boundary.clearGrant.mockResolvedValue(undefined);
  boundary.releaseSurface.mockResolvedValue(undefined);
  boundary.requestStop
    .mockReset()
    .mockResolvedValue({ terminalError: null, recordingPointTransform: null });
  finishVideoRecordingStop();
  resetActiveVideoRecordingLeaseForTests();
  resetCompletedVideoRecordingSession();
  resetVideoRecordingRuntimeState();
});

it.each([CaptureMode.TAB, CaptureMode.TAB_CROP, CaptureMode.SCREEN, CaptureMode.CAMERA])(
  'does not resurrect stopped %s while lease revocation is pending',
  async (mode) => {
    await start(mode);
    const entered = deferred();
    const release = deferred();
    boundary.remove.mockImplementationOnce(async (key: string) => {
      entered.resolve();
      await release.promise;
      delete stored[key];
    });
    const completed = new Promise((resolve) => {
      handleOffscreenRecordingStopped({ recordingId }, resolve);
    });
    await entered.promise;
    const duringCleanup = await readState();
    release.resolve();
    await expect(completed).resolves.toEqual({ success: true, result: 'accepted' });
    const afterCleanup = await readState();
    expect(duringCleanup).not.toEqual(
      expect.objectContaining({
        state: expect.objectContaining({ status: VideoRecordingStatus.RECORDING }),
      })
    );
    expect(afterCleanup).toEqual(
      expect.objectContaining({
        state: expect.objectContaining({ status: VideoRecordingStatus.IDLE }),
      })
    );
    expect(getVideoRecordingId()).toBeNull();
    expect(stored).not.toHaveProperty('video-active-recording-lease');
  }
);

it('still restores an active recording from its persisted lease after worker restart', async () => {
  await start(CaptureMode.TAB);
  resetActiveVideoRecordingLeaseForTests();
  resetCompletedVideoRecordingSession();
  resetVideoRecordingRuntimeState();
  await expect(readState()).resolves.toEqual(
    expect.objectContaining({
      state: expect.objectContaining({ status: VideoRecordingStatus.RECORDING }),
    })
  );
  expect(getVideoRecordingId()).toBe(recordingId);
  expect(getVideoRecordingRuntimeState().captureMode).toBe(CaptureMode.TAB);
});

it('does not restore a terminal recording after worker memory is lost before grant revocation', async () => {
  await start(CaptureMode.CAMERA);
  const entered = deferred();
  const release = deferred();
  boundary.clearGrant.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
  });
  const completed = new Promise((resolve) => {
    handleOffscreenRecordingStopped({ recordingId }, resolve);
  });
  await entered.promise;
  resetActiveVideoRecordingLeaseForTests();
  resetCompletedVideoRecordingSession();
  resetVideoRecordingRuntimeState();
  const recovered = await readState();
  release.resolve();
  await completed;
  expect(recovered).toEqual(
    expect.objectContaining({
      state: expect.objectContaining({ status: VideoRecordingStatus.STOPPING }),
    })
  );
});

it('retries only lease revocation after grant cleanup succeeds and storage refuses removal', async () => {
  await start(CaptureMode.CAMERA);
  boundary.remove.mockRejectedValueOnce(new Error('Session storage refused removal'));
  await expect(completeVideoRecording(recordingId)).rejects.toThrow('refused removal');
  expect(boundary.clearGrant).toHaveBeenCalledOnce();
  expect(stored['video-active-recording-lease']).toMatchObject({
    phase: 'terminal',
    terminal: { outcome: 'stopped', cleanupStep: 'lease' },
  });
  resetActiveVideoRecordingLeaseForTests();
  resetCompletedVideoRecordingSession();
  resetVideoRecordingRuntimeState();
  await expect(readState()).resolves.toEqual(
    expect.objectContaining({
      state: expect.objectContaining({ status: VideoRecordingStatus.STOPPING }),
    })
  );
  await completeVideoRecording(recordingId);
  expect(boundary.clearGrant).toHaveBeenCalledOnce();
  expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.IDLE);
  expect(stored).not.toHaveProperty('video-active-recording-lease');
});

it('joins concurrent completion callers through one grant cleanup and lease revocation', async () => {
  await start(CaptureMode.TAB);
  const entered = deferred();
  const release = deferred();
  boundary.clearGrant.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
  });
  const first = completeVideoRecording(recordingId);
  await entered.promise;
  const second = completeVideoRecording(recordingId);
  expect(second).toBe(first);
  release.resolve();
  await Promise.all([first, second]);
  expect(boundary.clearGrant).toHaveBeenCalledOnce();
  expect(boundary.remove).toHaveBeenCalledOnce();
});

it('persists terminal intent before Stop dispatch and keeps it through worker-memory loss', async () => {
  await start(CaptureMode.TAB);
  const entered = deferred();
  const release = deferred();
  boundary.requestStop.mockImplementationOnce(async () => {
    expect(stored['video-active-recording-lease']).toMatchObject({
      phase: 'terminal',
      terminal: { discard: true, outcome: 'unknown' },
    });
    entered.resolve();
    await release.promise;
    return { terminalError: null, recordingPointTransform: null };
  });
  const stopped = stopRecording(true);
  await entered.promise;
  resetActiveVideoRecordingLeaseForTests();
  resetCompletedVideoRecordingSession();
  resetVideoRecordingRuntimeState();
  await expect(readState()).resolves.toEqual(
    expect.objectContaining({
      state: expect.objectContaining({ status: VideoRecordingStatus.STOPPING }),
    })
  );
  release.resolve();
  await expect(stopped).resolves.toEqual({ result: 'accepted' });
  expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.IDLE);
});

it('does not dispatch Stop when terminal intent storage refuses the write', async () => {
  await start(CaptureMode.TAB);
  setVideoRecordingRuntimeState({ status: VideoRecordingStatus.RECORDING });
  boundary.set.mockRejectedValueOnce(new Error('Intent storage unavailable'));
  await expect(stopRecording(true)).resolves.toEqual({
    result: 'failed',
    error: 'Intent storage unavailable',
  });
  expect(boundary.requestStop).not.toHaveBeenCalled();
  expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.RECORDING);
  expect(stored['video-active-recording-lease']).toMatchObject({ phase: 'active' });
});

it('retries confirmed background cleanup through Stop without sending another offscreen command', async () => {
  await start(CaptureMode.CAMERA);
  boundary.remove.mockRejectedValueOnce(new Error('Lease removal unavailable'));
  await expect(stopRecording(true)).resolves.toEqual({
    result: 'failed',
    error: 'Lease removal unavailable',
  });
  expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.STOPPING);
  resetActiveVideoRecordingLeaseForTests();
  resetCompletedVideoRecordingSession();
  resetVideoRecordingRuntimeState();
  await readState();
  await expect(stopRecording(true)).resolves.toEqual({ result: 'accepted' });
  expect(boundary.requestStop).toHaveBeenCalledOnce();
  expect(boundary.clearGrant).toHaveBeenCalledOnce();
  expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.IDLE);
});

it('does not convert failed offscreen cleanup into success on a second Stop', async () => {
  await start(CaptureMode.TAB);
  boundary.requestStop.mockResolvedValueOnce({
    terminalError: 'Staging cleanup failed',
    recordingPointTransform: null,
  });
  await expect(stopRecording(true)).resolves.toEqual({
    result: 'failed',
    error: 'Staging cleanup failed',
  });
  await expect(stopRecording(true)).resolves.toMatchObject({ result: 'failed' });
  expect(boundary.requestStop).toHaveBeenCalledOnce();
  expect(boundary.clearGrant).not.toHaveBeenCalled();
  expect(stored['video-active-recording-lease']).toMatchObject({
    phase: 'terminal',
    terminal: { outcome: 'failed' },
  });
  expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.STOPPING);
});

it('serializes delayed A removal before B publication without clearing B runtime or storage', async () => {
  await start(CaptureMode.TAB);
  const entered = deferred();
  const release = deferred();
  boundary.remove.mockImplementationOnce(async (key: string) => {
    entered.resolve();
    await release.promise;
    delete stored[key];
  });
  const completion = completeVideoRecording(recordingId);
  await entered.promise;
  setVideoRecordingId('recording-b');
  const next = issuePreparedVideoRecordingLease({
    captureMode: CaptureMode.TAB,
    ownerSenderUrl: 'chrome-extension://test/popup.html',
    surfaceBinding: { generation: 2, streamInstanceId: 'source-b' },
  });
  release.resolve();
  await Promise.all([completion, next]);
  await activateVideoRecordingLease({
    recordingId: 'recording-b',
    generation: 2,
    streamInstanceId: 'source-b',
  });
  setVideoRecordingRuntimeState({ status: VideoRecordingStatus.RECORDING });
  await clearActiveVideoRecordingLease(recordingId);
  expect(getVideoRecordingId()).toBe('recording-b');
  expect(stored['video-active-recording-lease']).toMatchObject({
    recordingId: 'recording-b',
    phase: 'active',
  });
});

it('rejects delayed hydration and terminal writes from a prior generation of the same identity', async () => {
  await start(CaptureMode.TAB);
  const previous = structuredClone(stored);
  await clearActiveVideoRecordingLease(recordingId);
  resetActiveVideoRecordingLeaseForTests();
  resetCompletedVideoRecordingSession();
  resetVideoRecordingRuntimeState();
  const entered = deferred();
  const release = deferred();
  boundary.get.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
    return previous;
  });
  const hydration = hydrateActiveVideoRecordingLease();
  await entered.promise;
  setVideoRecordingId(recordingId);
  setVideoRecordingTabId(17);
  await issuePreparedVideoRecordingLease({
    captureMode: CaptureMode.TAB,
    ownerSenderUrl: 'chrome-extension://test/popup.html',
    surfaceBinding: { generation: 2, streamInstanceId: 'replacement-source' },
  });
  await activateVideoRecordingLease({
    recordingId,
    generation: 2,
    streamInstanceId: 'replacement-source',
  });
  release.resolve();
  await hydration;
  await expect(
    updateVideoRecordingTerminal(
      { recordingId, generation: 1, streamInstanceId: 'source-a' },
      {
        discard: true,
        outcome: 'stopped',
        cleanupStep: 'surface',
      }
    )
  ).rejects.toThrow('identity changed');
  expect(stored['video-active-recording-lease']).toMatchObject({
    phase: 'active',
    surfaceBinding: { generation: 2, streamInstanceId: 'replacement-source' },
  });
});

it('keeps expired terminal evidence while refusing expired or mismatched control capabilities', async () => {
  await start(CaptureMode.CAMERA);
  const lease = getActiveVideoRecordingLeaseSnapshot();
  expect(lease).not.toBeNull();
  const terminal = await updateVideoRecordingTerminal(
    { recordingId, generation: 1, streamInstanceId: 'source-a' },
    {
      discard: true,
      outcome: 'unknown',
      cleanupStep: 'surface',
    }
  );
  const capability = {
    recordingId,
    controlToken: terminal.controlToken,
    ownerSenderUrl: terminal.ownerSenderUrl,
  };
  expect(validateRecordingControlCapability(capability)).toBe(false);
  expect(validateTerminalRecordingStopCapability(capability)).toBe(true);
  expect(
    validateTerminalRecordingStopCapability({ ...capability, ownerSenderUrl: 'untrusted' })
  ).toBe(false);
  stored['video-active-recording-lease'] = { ...terminal, version: 2, expiresAt: Date.now() - 1 };
  resetActiveVideoRecordingLeaseForTests();
  resetCompletedVideoRecordingSession();
  resetVideoRecordingRuntimeState();
  await readState();
  expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.STOPPING);
  expect(validateTerminalRecordingStopCapability(capability)).toBe(false);
  expect(stored).toHaveProperty('video-active-recording-lease');
});

it('refuses terminal writes during local data erasure instead of queueing resurrection', async () => {
  await start(CaptureMode.TAB);
  const entered = deferred();
  const release = deferred();
  const erasure = runWithExclusivePersistenceMutationPermit(async () => {
    entered.resolve();
    await release.promise;
    stored = {};
  });
  await entered.promise;
  const stop = await stopRecording(true);
  expect(stop).toMatchObject({ result: 'failed' });
  expect(boundary.requestStop).not.toHaveBeenCalled();
  release.resolve();
  await erasure;
  expect(stored).toEqual({});
});

it('ignores delayed live lifecycle events after terminal cleanup failed', async () => {
  await start(CaptureMode.CAMERA);
  boundary.requestStop.mockResolvedValueOnce({
    terminalError: 'Staging cleanup failed',
    recordingPointTransform: null,
  });
  await stopRecording(true);
  for (const route of [
    handleOffscreenRecordingStarted,
    handleOffscreenRecordingPaused,
    handleOffscreenRecordingResumed,
  ]) {
    await new Promise((resolve) => {
      route({ recordingId }, resolve);
    });
    expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.STOPPING);
  }
});

it('preserves confirmed stopped evidence when a later failure ACK arrives during grant cleanup', async () => {
  await start(CaptureMode.CAMERA);
  const entered = deferred();
  const release = deferred();
  boundary.clearGrant.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
  });
  let event: Promise<unknown> = Promise.resolve();
  boundary.requestStop.mockImplementationOnce(async () => {
    event = new Promise((resolve) => {
      handleOffscreenRecordingStopped({ recordingId }, resolve);
    });
    await entered.promise;
    return { terminalError: 'Late terminal error', recordingPointTransform: null };
  });
  const stopped = stopRecording(true);
  await entered.promise;
  release.resolve();
  await expect(stopped).resolves.toEqual({ result: 'accepted' });
  await event;
  expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.IDLE);
  expect(boundary.clearGrant).toHaveBeenCalledOnce();
});

it.each([
  ['before', 'stop'],
  ['after', 'stop'],
  ['before', 'runtime'],
  ['after', 'runtime'],
] as const)(
  'retains failed cleanup when its error event arrives %s the failure ACK with phase %s',
  async (order, phase) => {
    await start(CaptureMode.CAMERA);
    const sendError = () =>
      new Promise((resolve) => {
        handleOffscreenError({ recordingId, phase, error: 'Staging cleanup failed' }, resolve);
      });
    boundary.requestStop.mockImplementationOnce(async () => {
      if (order === 'before') await sendError();
      return { terminalError: 'Staging cleanup failed', recordingPointTransform: null };
    });
    await expect(stopRecording(true)).resolves.toMatchObject({ result: 'failed' });
    if (order === 'after') await sendError();
    expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.STOPPING);
    expect(stored['video-active-recording-lease']).toMatchObject({
      phase: 'terminal',
      terminal: { outcome: 'failed' },
    });
    expect(boundary.clearGrant).not.toHaveBeenCalled();
  }
);

it.each(['active', 'terminal'] as const)(
  'rejects delayed lifecycle recovery of %s A after completed removal',
  async (phase) => {
    await start(CaptureMode.CAMERA);
    if (phase === 'terminal')
      await updateVideoRecordingTerminal(
        { recordingId, generation: 1, streamInstanceId: 'source-a' },
        { discard: true, outcome: 'unknown', cleanupStep: 'surface' }
      );
    const snapshot = structuredClone(stored);
    resetActiveVideoRecordingLeaseForTests();
    resetCompletedVideoRecordingSession();
    resetVideoRecordingRuntimeState();
    const entered = deferred();
    const release = deferred();
    boundary.get.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      return snapshot;
    });
    const event = new Promise((resolve) => {
      handleRecordingDurationUpdated({ recordingId, duration: 12 }, resolve);
    });
    await entered.promise;
    await hydrateActiveVideoRecordingLease();
    await completeVideoRecording(recordingId);
    release.resolve();
    await event;
    expect(stored).toEqual({});
    expect(getActiveVideoRecordingLeaseSnapshot()).toBeNull();
    expect(getVideoRecordingId()).toBeNull();
    expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.IDLE);
  }
);

it.each([
  ['started', handleOffscreenRecordingStarted],
  ['paused', handleOffscreenRecordingPaused],
  ['resumed', handleOffscreenRecordingResumed],
] as const)(
  'does not publish admitted %s after Stop fails during telemetry synchronization',
  async (_name, route) => {
    beginVideoRecordingPreparation(CaptureMode.TAB, DEFAULT_VIDEO_SETTINGS, null);
    await start(CaptureMode.TAB);
    markVideoRecordingPreparationSettled();
    setVideoRecordingRuntimeState({ status: VideoRecordingStatus.RECORDING });
    const entered = deferred();
    const release = deferred();
    installBackgroundRuntimeMessagingMock({
      sendTabMessage: async () => {
        entered.resolve();
        await release.promise;
        return { success: true };
      },
    });
    const event = new Promise((resolve) => route({ recordingId }, resolve));
    await entered.promise;
    boundary.requestStop.mockResolvedValueOnce({
      terminalError: 'Staging cleanup failed',
      recordingPointTransform: null,
    });
    await stopRecording(true);
    const terminalState = getVideoRecordingRuntimeState();
    release.resolve();
    await event;
    expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.STOPPING);
    expect(getVideoRecordingRuntimeState().error).toBe(terminalState.error);
  }
);

it.each(['grant', 'surface'] as const)(
  'retains terminal failure when admitted runtime error resumes after %s cleanup',
  async (cleanup) => {
    await start(CaptureMode.CAMERA);
    setVideoRecordingRuntimeState({ status: VideoRecordingStatus.RECORDING });
    const entered = deferred();
    const release = deferred();
    const boundaryCall = cleanup === 'grant' ? boundary.clearGrant : boundary.releaseSurface;
    boundaryCall.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
    const event = new Promise((resolve) => {
      handleOffscreenError(
        { recordingId, phase: 'runtime', error: 'Source finalization failed' },
        resolve
      );
    });
    await entered.promise;
    boundary.requestStop.mockResolvedValueOnce({
      terminalError: 'Source finalization failed',
      recordingPointTransform: null,
    });
    await expect(stopRecording(true)).resolves.toMatchObject({ result: 'failed' });
    release.resolve();
    await event;
    expect(getVideoRecordingId()).toBe(recordingId);
    expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.STOPPING);
    expect(stored['video-active-recording-lease']).toMatchObject({
      phase: 'terminal',
      terminal: { outcome: 'failed' },
    });
  }
);

it('does not downgrade confirmed completion when a runtime error arrives during remaining grant cleanup', async () => {
  await start(CaptureMode.CAMERA);
  boundary.clearGrant.mockRejectedValueOnce(new Error('grant removal refused'));
  await expect(completeVideoRecording(recordingId)).rejects.toThrow('grant removal refused');
  await new Promise((resolve) => {
    handleOffscreenError({ recordingId, phase: 'runtime', error: 'Late source error' }, resolve);
  });
  expect(stored['video-active-recording-lease']).toMatchObject({
    phase: 'terminal',
    terminal: { outcome: 'stopped', cleanupStep: 'camera-grant' },
  });
  expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.STOPPING);
  await expect(stopRecording(true)).resolves.toEqual({ result: 'accepted' });
  expect(boundary.requestStop).not.toHaveBeenCalled();
  expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.IDLE);
});

it('retains discard failure when runtime error arrives before terminal intent commits', async () => {
  await start(CaptureMode.CAMERA);
  const entered = deferred();
  const release = deferred();
  boundary.set.mockImplementationOnce(async (values: Record<string, unknown>) => {
    entered.resolve();
    await release.promise;
    Object.assign(stored, structuredClone(values));
  });
  boundary.requestStop.mockResolvedValueOnce({
    terminalError: 'Staging cleanup failed',
    recordingPointTransform: null,
  });
  const stopping = stopRecording(true);
  await entered.promise;
  const error = new Promise((resolve) => {
    handleOffscreenError(
      { recordingId, phase: 'runtime', error: 'Staging cleanup failed' },
      resolve
    );
  });
  // Drain the admitted error's immediate cleanup awaits while intent storage stays blocked.
  await new Promise<void>((resolve) => setImmediate(resolve));
  const identityBeforeCommit = getVideoRecordingId();
  release.resolve();
  const result = await stopping;
  await error;
  expect(identityBeforeCommit).toBe(recordingId);
  expect(result).toMatchObject({ result: 'failed' });
  expect(getVideoRecordingId()).toBe(recordingId);
  expect(getVideoRecordingRuntimeState().status).toBe(VideoRecordingStatus.STOPPING);
  expect(stored['video-active-recording-lease']).toMatchObject({
    phase: 'terminal',
    terminal: { discard: true, outcome: 'failed' },
  });
  expect(isVideoRecordingStopInProgress()).toBe(false);
  expect(boundary.clearGrant).not.toHaveBeenCalled();
  expect(boundary.remove).not.toHaveBeenCalled();
});
