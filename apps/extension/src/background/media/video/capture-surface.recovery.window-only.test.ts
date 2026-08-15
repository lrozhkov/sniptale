import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  clearActiveLease: vi.fn(),
  ensureActiveLeaseHydrated: vi.fn(),
  getAppliedBindingForSession: vi.fn(),
  hasSessionLease: vi.fn(),
  recoverCaptureSurfaces: vi.fn(),
  reassert: vi.fn(),
  releaseApplied: vi.fn(),
  stopOffscreen: vi.fn(),
}));

vi.mock('../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface')>()),
  getCaptureSurfaceService: () => ({
    getAppliedBindingForSession: mocks.getAppliedBindingForSession,
    hasSessionLease: mocks.hasSessionLease,
    reassert: mocks.reassert,
  }),
  recoverCaptureSurfaces: mocks.recoverCaptureSurfaces,
}));
vi.mock('./recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./recording-control-lease')>()),
  clearActiveVideoRecordingLease: mocks.clearActiveLease,
  ensureActiveVideoRecordingLeaseHydrated: mocks.ensureActiveLeaseHydrated,
}));
vi.mock('./offscreen-recording-stop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./offscreen-recording-stop')>()),
  requestBoundOffscreenRecordingStop: mocks.stopOffscreen,
}));
vi.mock('./capture-surface/release-applied', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./capture-surface/release-applied')>()),
  releaseAppliedVideoCaptureSurface: mocks.releaseApplied,
}));

import {
  deferVideoCaptureSurfaceWorkUntilRecovery,
  getVideoSurfaceSession,
  recoverVideoCaptureSurfaceOnStartup,
  waitForVideoCaptureSurfaceRecovery,
} from './capture-surface';
import {
  isRecoveredPresetBindingValid,
  prepareAbandonedVideoSurfaceRestore,
  stopBoundRecordingBeforeAbandonedStackRestore,
  stopInvalidRecoveredRecording,
  stopPreparedRecoveredRecording,
} from './capture-surface/recovery-cleanup';

const applied = {
  generation: 4,
  height: 720,
  leaseId: 'lease-window',
  presetId: 'window-hd',
  sessionId: 'recording-1',
  target: 'window' as const,
  width: 1280,
};
const binding = { applied, tabId: 9 };

function activeLease(overrides: Record<string, unknown> = {}) {
  return {
    captureMode: CaptureMode.TAB,
    controlToken: 'control-1',
    cropRegion: null,
    expiresAt: Number.MAX_SAFE_INTEGER,
    ownerSenderUrl: 'chrome-extension://test/popup.html',
    phase: 'active' as const,
    recordingId: applied.sessionId,
    recordingTabId: binding.tabId,
    surfaceBinding: { generation: applied.generation, streamInstanceId: 'stream-1' },
    viewportPresetId: applied.presetId,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clearActiveLease.mockResolvedValue(undefined);
  mocks.ensureActiveLeaseHydrated.mockResolvedValue(null);
  mocks.getAppliedBindingForSession.mockReturnValue(null);
  mocks.hasSessionLease.mockReturnValue(false);
  mocks.reassert.mockResolvedValue(undefined);
  mocks.recoverCaptureSurfaces.mockResolvedValue(undefined);
  mocks.releaseApplied.mockResolvedValue(undefined);
  mocks.stopOffscreen.mockResolvedValue({ terminalError: null });
});

describe('window-only video capture-surface recovery', () => {
  it('recovers no recording without issuing an unbound stop', async () => {
    await recoverVideoCaptureSurfaceOnStartup();
    const liveSessionIds = mocks.recoverCaptureSurfaces.mock.calls[0]?.[0]?.liveSessionIds;
    await expect(liveSessionIds).resolves.toEqual(new Set());
    expect(mocks.stopOffscreen).not.toHaveBeenCalled();
  });

  it('clears a current-window recording lease that has no surface binding', async () => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(
      activeLease({ surfaceBinding: null, viewportPresetId: null })
    );
    await recoverVideoCaptureSurfaceOnStartup();
    expect(mocks.clearActiveLease).toHaveBeenCalledWith(applied.sessionId);
    expect(mocks.stopOffscreen).not.toHaveBeenCalled();
  });

  it('rehydrates and reasserts a valid browser-window preset binding', async () => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(activeLease());
    mocks.getAppliedBindingForSession.mockReturnValueOnce(binding);

    await recoverVideoCaptureSurfaceOnStartup();

    expect(mocks.reassert).toHaveBeenCalledWith({
      generation: applied.generation,
      leaseId: applied.leaseId,
      sessionId: applied.sessionId,
    });
    expect(getVideoSurfaceSession(applied.sessionId)).toMatchObject({
      applied,
      sourceReady: true,
      streamInstanceId: 'stream-1',
      tabId: 9,
    });
  });

  it('stops and releases a prepared recording instead of reviving it', async () => {
    const lease = activeLease({ phase: 'prepared' });
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(lease);
    mocks.getAppliedBindingForSession.mockReturnValueOnce(binding);

    await recoverVideoCaptureSurfaceOnStartup();

    expect(mocks.stopOffscreen).toHaveBeenCalledWith(
      { generation: 4, recordingId: applied.sessionId, streamInstanceId: 'stream-1' },
      true
    );
    expect(mocks.releaseApplied).toHaveBeenCalledWith(applied, 9);
    expect(mocks.clearActiveLease).toHaveBeenCalledWith(applied.sessionId);
  });

  it('stops an active recording whose durable window binding is missing', async () => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(activeLease());

    await recoverVideoCaptureSurfaceOnStartup();

    expect(mocks.stopOffscreen).toHaveBeenCalledOnce();
    expect(mocks.clearActiveLease).toHaveBeenCalledWith(applied.sessionId);
    expect(getVideoSurfaceSession(applied.sessionId)).toBeNull();
  });

  it('recovers current-window recording identity without a preset lease', async () => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(activeLease({ viewportPresetId: null }));

    await recoverVideoCaptureSurfaceOnStartup();

    expect(getVideoSurfaceSession(applied.sessionId)).toMatchObject({
      applied: null,
      streamInstanceId: 'stream-1',
      tabId: 9,
    });
    expect(mocks.reassert).not.toHaveBeenCalled();
  });

  it('clears recording authority after bound abandoned-stack cleanup', async () => {
    const lease = activeLease();
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(lease);
    mocks.recoverCaptureSurfaces.mockImplementationOnce(async (options) => {
      await options.beforeAbandonedStackRestore([
        {
          generation: 4,
          owner: 'video',
          sessionId: applied.sessionId,
          tabId: 9,
          target: 'window',
        },
      ]);
    });

    await recoverVideoCaptureSurfaceOnStartup();

    expect(mocks.stopOffscreen).toHaveBeenCalledOnce();
    expect(mocks.clearActiveLease).toHaveBeenCalledWith(applied.sessionId);
  });

  it('fails closed when abandoned stack cleanup leaves surface authority behind', async () => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(activeLease());
    mocks.hasSessionLease.mockReturnValueOnce(true);
    mocks.recoverCaptureSurfaces.mockImplementationOnce(async (options) => {
      await options.beforeAbandonedStackRestore([
        {
          generation: 4,
          owner: 'video',
          sessionId: applied.sessionId,
          tabId: 9,
          target: 'window',
        },
      ]);
    });

    await expect(recoverVideoCaptureSurfaceOnStartup()).rejects.toThrow(
      'retains capture-surface authority'
    );
    await expect(waitForVideoCaptureSurfaceRecovery()).rejects.toThrow(
      'retains capture-surface authority'
    );

    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(null);
    await recoverVideoCaptureSurfaceOnStartup();
  });

  it('stops a recovered recording when native window reassertion fails', async () => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(activeLease());
    mocks.getAppliedBindingForSession.mockReturnValueOnce(binding);
    mocks.reassert.mockRejectedValueOnce(new Error('window changed'));

    await recoverVideoCaptureSurfaceOnStartup();

    expect(mocks.stopOffscreen).toHaveBeenCalledOnce();
    expect(mocks.releaseApplied).toHaveBeenCalledWith(applied, 9);
    expect(getVideoSurfaceSession(applied.sessionId)).toBeNull();
  });

  it('defers callers behind an in-flight recovery barrier', async () => {
    let finishRecovery!: () => void;
    mocks.recoverCaptureSurfaces.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishRecovery = resolve;
      })
    );
    const recovery = recoverVideoCaptureSurfaceOnStartup();
    const run = vi.fn();
    const fail = vi.fn();
    expect(deferVideoCaptureSurfaceWorkUntilRecovery(run, fail)).toBe(true);
    finishRecovery();
    await recovery;
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    await expect(waitForVideoCaptureSurfaceRecovery()).resolves.toBeUndefined();
    expect(fail).not.toHaveBeenCalled();
  });
});

describe('window-only recovered recording cleanup', () => {
  it('requires no page preparation before restoring an abandoned window', async () => {
    await expect(
      prepareAbandonedVideoSurfaceRestore(
        { generation: 1, owner: 'video', sessionId: 'stale', tabId: 9, target: 'window' },
        vi.fn()
      )
    ).resolves.toBeUndefined();
  });

  it('stops only the recording bound to an abandoned window stack', async () => {
    const lease = activeLease();
    await expect(stopBoundRecordingBeforeAbandonedStackRestore(null, [])).resolves.toBe(false);
    await expect(
      stopBoundRecordingBeforeAbandonedStackRestore(lease, [
        { generation: 1, owner: 'screenshot', sessionId: 'other', tabId: 9, target: 'window' },
      ])
    ).resolves.toBe(false);
    await expect(
      stopBoundRecordingBeforeAbandonedStackRestore(lease, [
        {
          generation: 4,
          owner: 'video',
          sessionId: applied.sessionId,
          tabId: 9,
          target: 'window',
        },
      ])
    ).resolves.toBe(true);
    expect(mocks.stopOffscreen).toHaveBeenCalledWith(
      { generation: 4, recordingId: applied.sessionId, streamInstanceId: 'stream-1' },
      true
    );
  });

  it('validates the durable window preset and source identities exactly', () => {
    const lease = activeLease();
    expect(isRecoveredPresetBindingValid(lease, binding)).toBe(true);
    expect(isRecoveredPresetBindingValid(lease, { ...binding, tabId: 10 })).toBe(false);
    expect(isRecoveredPresetBindingValid({ ...lease, surfaceBinding: null }, binding)).toBe(false);
  });

  it('uses a rehydrated session binding when stopping an invalid recovery', async () => {
    const { storeVideoSurfaceSession } = await import('./capture-surface/session-registry');
    storeVideoSurfaceSession({
      applied,
      generation: 5,
      recordingId: applied.sessionId,
      sourceReady: true,
      sourceVideoHeight: null,
      sourceVideoWidth: null,
      streamInstanceId: 'stream-session',
      tabId: 9,
    });

    await stopInvalidRecoveredRecording(
      applied.sessionId,
      { generation: 4, streamInstanceId: 'stream-persisted' },
      binding,
      vi.fn()
    );

    expect(mocks.stopOffscreen).toHaveBeenCalledWith(
      { generation: 5, recordingId: applied.sessionId, streamInstanceId: 'stream-session' },
      true
    );
    expect(mocks.releaseApplied).toHaveBeenCalledWith(applied, 9);
    expect(getVideoSurfaceSession(applied.sessionId)).toBeNull();
  });

  it('rejects incomplete prepared and invalid recovered source identities', async () => {
    await expect(
      stopPreparedRecoveredRecording(activeLease({ surfaceBinding: null }), binding, vi.fn())
    ).rejects.toThrow('incomplete');
    await expect(
      stopInvalidRecoveredRecording('missing-binding', null, null, vi.fn())
    ).rejects.toThrow('incomplete');
  });
});
