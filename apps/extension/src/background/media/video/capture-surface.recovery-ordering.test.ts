import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  compactViewportPreset,
  getCaptureSurfaceServiceTestMocks,
  viewportPreset,
} from '../../capture-surface/service.test-support';

const surfaceMocks = getCaptureSurfaceServiceTestMocks();
const videoMocks = vi.hoisted(() => ({
  clearActiveLease: vi.fn(),
  disableViewportCursorProjection: vi.fn(),
  ensureActiveLeaseHydrated: vi.fn(),
  retireViewportCursorProjectionAuthority: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('./recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./recording-control-lease')>()),
  clearActiveVideoRecordingLease: videoMocks.clearActiveLease,
  ensureActiveVideoRecordingLeaseHydrated: videoMocks.ensureActiveLeaseHydrated,
}));

vi.mock('./capture-surface/cursor-projection', () => ({
  disableViewportCursorProjection: videoMocks.disableViewportCursorProjection,
  enableViewportCursorProjection: vi.fn(),
  retireViewportCursorProjectionAuthority: videoMocks.retireViewportCursorProjectionAuthority,
}));

vi.mock('../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../routing-contracts/runtime-messaging/services')>()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: videoMocks.sendRuntimeMessage }),
}));

import {
  recoverVideoCaptureSurfaceOnStartup,
  waitForVideoCaptureSurfaceRecovery,
} from './capture-surface';
import {
  getCaptureSurfaceService,
  resetCaptureSurfaceServiceForTests,
} from '../../capture-surface';

const recordingId = 'recording-live';
const tabId = 7;

function nestedJournal() {
  const parent = {
    applied: {
      height: viewportPreset.height,
      presetId: viewportPreset.id,
      type: 'viewport' as const,
      width: viewportPreset.width,
    },
    generation: 1,
    leaseId: 'lease-parent',
    owner: 'screenshot' as const,
    parentLeaseId: null,
    phase: 'suspended' as const,
    presetId: viewportPreset.id,
    prior: { height: 900, type: 'native' as const, width: 1440 },
    sessionId: 'screenshot-stale',
    tabId,
    target: 'viewport' as const,
    updatedAt: 10,
    version: 1 as const,
    windowId: 3,
  };
  const child = {
    applied: {
      height: compactViewportPreset.height,
      presetId: compactViewportPreset.id,
      type: 'viewport' as const,
      width: compactViewportPreset.width,
    },
    generation: 4,
    leaseId: 'lease-child',
    owner: 'video' as const,
    parentLeaseId: parent.leaseId,
    phase: 'applied' as const,
    presetId: compactViewportPreset.id,
    prior: parent.applied,
    sessionId: recordingId,
    tabId,
    target: 'viewport' as const,
    updatedAt: 20,
    version: 1 as const,
    windowId: 3,
  };
  return { child, parent };
}

function activeLease() {
  return {
    captureMode: CaptureMode.TAB,
    recordingId,
    recordingTabId: tabId,
    phase: 'active' as const,
    surfaceBinding: { generation: 4, streamInstanceId: 'stream-live' },
    viewportPresetId: compactViewportPreset.id,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCaptureSurfaceServiceForTests();
  const { child, parent } = nestedJournal();
  surfaceMocks.readJournal.mockResolvedValue([parent, child]);
  surfaceMocks.currentViewport
    .mockResolvedValueOnce({ height: child.applied.height, width: child.applied.width })
    .mockResolvedValueOnce({ height: parent.applied.height, width: parent.applied.width });
  videoMocks.clearActiveLease.mockResolvedValue(undefined);
  videoMocks.disableViewportCursorProjection.mockResolvedValue(undefined);
  videoMocks.ensureActiveLeaseHydrated.mockResolvedValue(activeLease());
  videoMocks.sendRuntimeMessage.mockResolvedValue({ success: true });
});

describe('bound recording recovery barrier', () => {
  it('acknowledges bound STOP before cursor or physical nested-stack cleanup', async () => {
    const ensurePageAccess = vi.fn().mockResolvedValue(undefined);

    await recoverVideoCaptureSurfaceOnStartup(ensurePageAccess);

    const stopCall = videoMocks.sendRuntimeMessage.mock.invocationCallOrder[0];
    expect(stopCall).toBeLessThan(
      videoMocks.retireViewportCursorProjectionAuthority.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY
    );
    expect(stopCall).toBeLessThan(
      surfaceMocks.restoreViewportSnapshot.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(videoMocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        generation: 4,
        recordingId,
        streamInstanceId: 'stream-live',
        type: 'OFFSCREEN_STOP_RECORDING',
      })
    );
    expect(surfaceMocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
    expect(videoMocks.clearActiveLease).toHaveBeenCalledWith(recordingId);
  });

  it('retains physical and recording authority when bound STOP is rejected', async () => {
    const { child } = nestedJournal();
    videoMocks.sendRuntimeMessage.mockResolvedValueOnce({
      error: 'bound stop denied',
      success: false,
    });

    await expect(
      recoverVideoCaptureSurfaceOnStartup(vi.fn().mockResolvedValue(undefined))
    ).rejects.toThrow('bound stop denied');
    await expect(waitForVideoCaptureSurfaceRecovery()).rejects.toThrow('bound stop denied');

    expect(videoMocks.retireViewportCursorProjectionAuthority).not.toHaveBeenCalled();
    expect(surfaceMocks.restoreViewportSnapshot).not.toHaveBeenCalled();
    expect(surfaceMocks.writeJournal).not.toHaveBeenCalled();
    expect(getCaptureSurfaceService().getAppliedBindingForSession(recordingId)).toEqual({
      applied: expect.objectContaining({ leaseId: child.leaseId, sessionId: recordingId }),
      tabId,
    });
    expect(videoMocks.clearActiveLease).not.toHaveBeenCalled();
  });

  it('retains both authorities when physical cleanup fails after acknowledged STOP', async () => {
    surfaceMocks.restoreViewportSnapshot.mockRejectedValueOnce(new Error('restore denied'));

    await expect(
      recoverVideoCaptureSurfaceOnStartup(vi.fn().mockResolvedValue(undefined))
    ).rejects.toThrow('retains capture-surface authority');

    expect(videoMocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OFFSCREEN_STOP_RECORDING' })
    );
    expect(surfaceMocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ leaseId: 'lease-parent', phase: 'suspended' }),
      expect.objectContaining({ leaseId: 'lease-child', phase: 'conflict' }),
    ]);
    expect(getCaptureSurfaceService().hasSessionLease(recordingId)).toBe(true);
    expect(videoMocks.clearActiveLease).not.toHaveBeenCalled();
  });
});
