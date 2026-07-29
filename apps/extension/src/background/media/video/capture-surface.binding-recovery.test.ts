import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  clearActiveLease: vi.fn(),
  disableViewportCursorProjection: vi.fn(),
  ensureActiveLeaseHydrated: vi.fn(),
  ensurePageAccess: vi.fn(),
  getAppliedBindingForSession: vi.fn(),
  hasSessionLease: vi.fn(),
  recoverCaptureSurfaces: vi.fn(),
  release: vi.fn(),
  retireViewportCursorProjectionAuthority: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface')>()),
  getCaptureSurfaceService: () => ({
    getAppliedBindingForSession: mocks.getAppliedBindingForSession,
    hasSessionLease: mocks.hasSessionLease,
    release: mocks.release,
  }),
  recoverCaptureSurfaces: mocks.recoverCaptureSurfaces,
}));

vi.mock('./recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./recording-control-lease')>()),
  clearActiveVideoRecordingLease: mocks.clearActiveLease,
  ensureActiveVideoRecordingLeaseHydrated: mocks.ensureActiveLeaseHydrated,
}));

vi.mock('./capture-surface/cursor-projection', () => ({
  disableViewportCursorProjection: mocks.disableViewportCursorProjection,
  enableViewportCursorProjection: vi.fn(),
  retireViewportCursorProjectionAuthority: mocks.retireViewportCursorProjectionAuthority,
}));

vi.mock('../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../routing-contracts/runtime-messaging/services')>()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.sendRuntimeMessage }),
}));

import { getVideoSurfaceSession, recoverVideoCaptureSurfaceOnStartup } from './capture-surface';
import { releaseAppliedVideoCaptureSurface } from './capture-surface/release-applied';

function appliedSurface(sessionId = 'recording-1') {
  return {
    generation: 4,
    height: 720,
    leaseId: 'lease-1',
    presetId: 'preset-1',
    sessionId,
    target: 'viewport' as const,
    width: 1280,
  };
}

function activeLease(recordingId: string, recordingTabId: number | null) {
  return {
    captureMode: CaptureMode.TAB,
    recordingId,
    recordingTabId,
    phase: 'active' as const,
    surfaceBinding: { generation: 4, streamInstanceId: 'stream-live' },
    viewportPresetId: 'preset-1',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clearActiveLease.mockResolvedValue(undefined);
  mocks.disableViewportCursorProjection.mockResolvedValue(undefined);
  mocks.ensurePageAccess.mockResolvedValue(undefined);
  mocks.hasSessionLease.mockReturnValue(false);
  mocks.recoverCaptureSurfaces.mockResolvedValue(undefined);
  mocks.release.mockResolvedValue(undefined);
  mocks.sendRuntimeMessage.mockResolvedValue({ success: true });
});

describe('recovered viewport surface identity', () => {
  it('refuses to release a viewport surface without its WAL-owned tab identity', async () => {
    await expect(releaseAppliedVideoCaptureSurface(appliedSurface(), null)).rejects.toThrow(
      'tab identity'
    );

    expect(mocks.disableViewportCursorProjection).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it.each([
    { durableTabId: null, label: 'null' },
    { durableTabId: 9, label: 'mismatched' },
  ])(
    'uses the WAL tab for strict cleanup when the durable viewport tab is $label',
    async ({ durableTabId }) => {
      const applied = appliedSurface(`recording-${durableTabId ?? 'null'}-tab`);
      mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(
        activeLease(applied.sessionId, durableTabId)
      );
      mocks.getAppliedBindingForSession.mockReturnValueOnce({ applied, tabId: 11 });

      await recoverVideoCaptureSurfaceOnStartup(mocks.ensurePageAccess);

      expect(mocks.retireViewportCursorProjectionAuthority).toHaveBeenCalledWith(11, {
        generation: 4,
        recordingId: applied.sessionId,
      });
      expect(
        mocks.retireViewportCursorProjectionAuthority.mock.invocationCallOrder[0]
      ).toBeLessThan(
        mocks.ensurePageAccess.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
      );
      expect(mocks.disableViewportCursorProjection).toHaveBeenCalledWith(11, {
        generation: 4,
        recordingId: applied.sessionId,
      });
      expect(mocks.release).toHaveBeenCalledWith(applied);
      expect(mocks.clearActiveLease).toHaveBeenCalledWith(applied.sessionId);
      expect(getVideoSurfaceSession(applied.sessionId)).toBeNull();
    }
  );

  it('retains authority when recovered cursor cleanup is unacknowledged', async () => {
    const applied = appliedSurface('recording-cleanup-failed');
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(activeLease(applied.sessionId, null));
    mocks.getAppliedBindingForSession.mockReturnValueOnce({ applied, tabId: 11 });
    mocks.disableViewportCursorProjection.mockRejectedValueOnce(new Error('disable denied'));

    await expect(recoverVideoCaptureSurfaceOnStartup(mocks.ensurePageAccess)).rejects.toThrow(
      'disable denied'
    );

    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.clearActiveLease).not.toHaveBeenCalled();
  });

  it('retains authority when the WAL-owned tab cannot be prepared', async () => {
    const applied = appliedSurface('recording-page-access-failed');
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(activeLease(applied.sessionId, null));
    mocks.getAppliedBindingForSession.mockReturnValueOnce({ applied, tabId: 11 });
    mocks.ensurePageAccess.mockRejectedValueOnce(new Error('page access denied'));

    await expect(recoverVideoCaptureSurfaceOnStartup(mocks.ensurePageAccess)).rejects.toThrow(
      'page access denied'
    );

    expect(mocks.retireViewportCursorProjectionAuthority).toHaveBeenCalledWith(11, {
      generation: 4,
      recordingId: applied.sessionId,
    });
    expect(mocks.disableViewportCursorProjection).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.clearActiveLease).not.toHaveBeenCalled();
  });
});
