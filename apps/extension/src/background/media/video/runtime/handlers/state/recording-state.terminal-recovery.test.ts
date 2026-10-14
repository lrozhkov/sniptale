import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const boundary = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  clearGrant: vi.fn(),
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
  releaseVideoCaptureSurface: vi.fn().mockResolvedValue(undefined),
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
  issuePreparedVideoRecordingLease,
  resetActiveVideoRecordingLeaseForTests,
} from '../../../recording-control-lease';
import {
  getVideoRecordingId,
  resetCompletedVideoRecordingSession,
  setVideoRecordingId,
  setVideoRecordingTabId,
} from '../../../session-state';
import {
  getVideoRecordingRuntimeState,
  resetVideoRecordingRuntimeState,
  setVideoRecordingRuntimeState,
} from '../../session-state/service/runtime-state-service';
import { handleOffscreenRecordingStopped, handleRecordingState } from './recording-state';

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
  resetActiveVideoRecordingLeaseForTests();
  resetCompletedVideoRecordingSession();
  resetVideoRecordingRuntimeState();
});

// Expected defects for the proof-only stage. Remove fails when terminal recovery is implemented.
it.fails.each([CaptureMode.TAB, CaptureMode.TAB_CROP, CaptureMode.SCREEN, CaptureMode.CAMERA])(
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

it.fails('does not restore a terminal recording after worker memory is lost before grant revocation', async () => {
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
