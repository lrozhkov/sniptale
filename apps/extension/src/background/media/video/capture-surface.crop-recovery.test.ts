import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  clearActiveLease: vi.fn(),
  createTransitionId: vi.fn(() => 'recovery-transition-1'),
  disableViewportCursorProjection: vi.fn(),
  enableViewportCursorProjection: vi.fn(),
  ensurePageAccess: vi.fn(),
  ensureActiveLeaseHydrated: vi.fn(),
  getAppliedBindingForSession: vi.fn(),
  getAppliedForSession: vi.fn(),
  hasSessionLease: vi.fn(),
  reassert: vi.fn(),
  recoverCaptureSurfaces: vi.fn(),
  readTabCaptureViewport: vi.fn(),
  retireViewportCursorProjectionAuthority: vi.fn(),
  release: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  verifyExactViewportOutput: vi.fn(),
}));

vi.mock('@sniptale/platform/security/secure-random-id', () => ({
  createSecureRandomUuid: mocks.createTransitionId,
}));

vi.mock('../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface')>()),
  getCaptureSurfaceService: () => ({
    getAppliedBindingForSession: mocks.getAppliedBindingForSession,
    getAppliedForSession: mocks.getAppliedForSession,
    hasSessionLease: mocks.hasSessionLease,
    release: mocks.release,
    reassert: mocks.reassert,
  }),
  recoverCaptureSurfaces: mocks.recoverCaptureSurfaces,
}));

vi.mock('./recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./recording-control-lease')>()),
  clearActiveVideoRecordingLease: mocks.clearActiveLease,
  ensureActiveVideoRecordingLeaseHydrated: mocks.ensureActiveLeaseHydrated,
}));

vi.mock('./capture-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./capture-viewport')>()),
  readTabCaptureViewport: mocks.readTabCaptureViewport,
}));

vi.mock('./capture-surface/cursor-projection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./capture-surface/cursor-projection')>()),
  disableViewportCursorProjection: mocks.disableViewportCursorProjection,
  enableViewportCursorProjection: mocks.enableViewportCursorProjection,
  retireViewportCursorProjectionAuthority: mocks.retireViewportCursorProjectionAuthority,
}));

vi.mock('./capture-surface/exact-output-verification', () => ({
  verifyExactViewportOutput: mocks.verifyExactViewportOutput,
}));

vi.mock('../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../routing-contracts/runtime-messaging/services')>()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.sendRuntimeMessage }),
}));

import { getVideoSurfaceSession, recoverVideoCaptureSurfaceOnStartup } from './capture-surface';
import { storeVideoSurfaceSession } from './capture-surface/session-registry';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.disableViewportCursorProjection.mockReset();
  mocks.getAppliedBindingForSession.mockReset();
  mocks.getAppliedForSession.mockReset();
  mocks.hasSessionLease.mockReset();
  mocks.clearActiveLease.mockResolvedValue(undefined);
  mocks.disableViewportCursorProjection.mockResolvedValue(undefined);
  mocks.enableViewportCursorProjection.mockResolvedValue(undefined);
  mocks.ensurePageAccess.mockResolvedValue(undefined);
  mocks.getAppliedBindingForSession.mockImplementation((sessionId: string) => {
    const applied = mocks.getAppliedForSession(sessionId);
    return applied ? { applied, tabId: 9 } : null;
  });
  mocks.hasSessionLease.mockReturnValue(false);
  mocks.reassert.mockResolvedValue(undefined);
  mocks.recoverCaptureSurfaces.mockResolvedValue(undefined);
  mocks.readTabCaptureViewport.mockResolvedValue({
    devicePixelRatio: 1,
    height: 1080,
    scrollX: 0,
    scrollY: 0,
    visualViewportScale: 1,
    width: 1920,
  });
  mocks.release.mockResolvedValue(undefined);
  mocks.sendRuntimeMessage.mockImplementation(async (message: { type: string }) => {
    if (message.type === 'OFFSCREEN_REVALIDATE_SOURCE') {
      return { success: true, result: 'ALLOW', videoWidth: 1280, videoHeight: 720 };
    }
    return { success: true, result: 'applied' };
  });
  mocks.verifyExactViewportOutput.mockResolvedValue({ height: 720, width: 1280 });
});

it('fails a persisted CROP plus viewport lease closed without reasserting or thawing it', async () => {
  const applied = {
    generation: 4,
    height: 720,
    leaseId: 'lease-forbidden',
    presetId: 'viewport-forbidden',
    sessionId: 'recording-crop-viewport',
    target: 'viewport' as const,
    width: 1280,
  };
  mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
    captureMode: CaptureMode.TAB_CROP,
    recordingId: 'recording-crop-viewport',
    recordingTabId: 9,
    phase: 'active',
    surfaceBinding: { generation: 4, streamInstanceId: 'stream-forbidden' },
    viewportPresetId: 'viewport-forbidden',
  });
  mocks.getAppliedForSession.mockReturnValue(applied);

  await recoverVideoCaptureSurfaceOnStartup(mocks.ensurePageAccess);

  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      discard: true,
      recordingId: 'recording-crop-viewport',
      type: 'OFFSCREEN_STOP_RECORDING',
    })
  );
  expect(
    mocks.sendRuntimeMessage.mock.calls.some(
      ([message]) =>
        message.type === 'OFFSCREEN_REVALIDATE_SOURCE' ||
        message.type === 'OFFSCREEN_SET_VIEWPORT_DRAW_STATE'
    )
  ).toBe(false);
  expect(mocks.reassert).not.toHaveBeenCalled();
  expect(mocks.ensurePageAccess).toHaveBeenCalledWith(
    9,
    'Recording page access is required to remove a recovered viewport cursor projection.'
  );
  expect(mocks.retireViewportCursorProjectionAuthority).toHaveBeenCalledWith(9, {
    generation: 4,
    recordingId: 'recording-crop-viewport',
  });
  expect(mocks.retireViewportCursorProjectionAuthority.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.ensurePageAccess.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );
  expect(mocks.disableViewportCursorProjection).toHaveBeenCalledWith(9, {
    generation: 4,
    recordingId: 'recording-crop-viewport',
  });
  expect(mocks.release).toHaveBeenCalledWith(applied);
  expect(mocks.clearActiveLease).toHaveBeenCalledWith('recording-crop-viewport');
  expect(getVideoSurfaceSession('recording-crop-viewport')).toBeNull();
});

it.each([
  { label: 'current-size', presetId: null, target: null },
  { label: 'window-preset', presetId: 'window-1', target: 'window' as const },
])(
  'recovers $label TAB_CROP through a tokenized fresh-output transaction',
  async ({ presetId, target }) => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
      captureMode: CaptureMode.TAB_CROP,
      recordingId: `recording-crop-${target ?? 'native'}`,
      recordingTabId: 9,
      phase: 'active',
      surfaceBinding: { generation: 4, streamInstanceId: 'stream-crop' },
      viewportPresetId: presetId,
    });
    mocks.getAppliedForSession.mockReturnValueOnce(
      target
        ? {
            generation: 4,
            height: 720,
            leaseId: 'lease-window',
            presetId: 'window-1',
            sessionId: 'recording-crop-window',
            target,
            width: 1280,
          }
        : null
    );

    await recoverVideoCaptureSurfaceOnStartup(mocks.ensurePageAccess);

    expect(
      mocks.sendRuntimeMessage.mock.calls.map(([message]) => ({
        frozen: message.frozen,
        transitionId: message.transitionId,
        type: message.type,
        viewport: message.viewport,
      }))
    ).toEqual([
      {
        frozen: true,
        transitionId: 'recovery-transition-1',
        type: 'OFFSCREEN_SET_VIEWPORT_DRAW_STATE',
        viewport: undefined,
      },
      {
        frozen: undefined,
        transitionId: 'recovery-transition-1',
        type: 'OFFSCREEN_REVALIDATE_SOURCE',
        viewport: {
          devicePixelRatio: 1,
          height: 1080,
          scrollX: 0,
          scrollY: 0,
          visualViewportScale: 1,
          width: 1920,
        },
      },
      {
        frozen: false,
        transitionId: 'recovery-transition-1',
        type: 'OFFSCREEN_SET_VIEWPORT_DRAW_STATE',
        viewport: undefined,
      },
    ]);
    expect(mocks.reassert).toHaveBeenCalledTimes(target ? 1 : 0);
    expect(mocks.ensurePageAccess).toHaveBeenCalledWith(
      9,
      'Recording page access is required to recover exact tab output.'
    );
    expect(mocks.ensurePageAccess.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.readTabCaptureViewport.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    if (target) {
      expect(mocks.reassert.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.ensurePageAccess.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
      );
    }
  }
);

it('recovers a live viewport TAB session through fresh page geometry', async () => {
  mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
    captureMode: CaptureMode.TAB,
    recordingId: 'recording-live-viewport',
    recordingTabId: 9,
    phase: 'active',
    surfaceBinding: { generation: 4, streamInstanceId: 'stream-live' },
    viewportPresetId: 'viewport-1',
  });
  mocks.getAppliedForSession.mockReturnValueOnce({
    generation: 4,
    height: 720,
    leaseId: 'lease-viewport',
    presetId: 'viewport-1',
    sessionId: 'recording-live-viewport',
    target: 'viewport',
    width: 1280,
  });

  await recoverVideoCaptureSurfaceOnStartup(mocks.ensurePageAccess);

  const liveSessionIds = mocks.recoverCaptureSurfaces.mock.calls[0]?.[0]?.liveSessionIds;
  await expect(liveSessionIds).resolves.toEqual(new Set(['recording-live-viewport']));
  expect(getVideoSurfaceSession('recording-live-viewport')).toMatchObject({
    generation: 4,
    streamInstanceId: 'stream-live',
    tabId: 9,
  });
  expect(mocks.reassert).toHaveBeenCalledWith({
    generation: 4,
    leaseId: 'lease-viewport',
    sessionId: 'recording-live-viewport',
  });
  expect(mocks.enableViewportCursorProjection).toHaveBeenCalledWith(9, {
    generation: 4,
    recordingId: 'recording-live-viewport',
  });
  expect(mocks.verifyExactViewportOutput).toHaveBeenCalledWith(
    expect.objectContaining({
      binding: expect.objectContaining({ recordingId: 'recording-live-viewport', tabId: 9 }),
      transitionId: 'recovery-transition-1',
      viewport: expect.objectContaining({ height: 1080, width: 1920 }),
    })
  );
});

it('does not issue an unbound stop when no persisted recording is live', async () => {
  mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(null);

  await recoverVideoCaptureSurfaceOnStartup(mocks.ensurePageAccess);

  const liveSessionIds = mocks.recoverCaptureSurfaces.mock.calls[0]?.[0]?.liveSessionIds;
  await expect(liveSessionIds).resolves.toEqual(new Set());
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
});

it('clears an unbound current-size lease without issuing a global stop', async () => {
  mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
    captureMode: CaptureMode.TAB,
    recordingId: 'recording-without-surface',
    recordingTabId: 9,
    phase: 'active',
    surfaceBinding: null,
    viewportPresetId: null,
  });
  mocks.getAppliedForSession.mockReturnValueOnce(null);

  await recoverVideoCaptureSurfaceOnStartup(mocks.ensurePageAccess);

  expect(mocks.clearActiveLease).toHaveBeenCalledWith('recording-without-surface');
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
  expect(getVideoSurfaceSession('recording-without-surface')).toBeNull();
});

it('routes abandoned video viewport cleanup through page access before journal restore', async () => {
  mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(null);
  await recoverVideoCaptureSurfaceOnStartup(mocks.ensurePageAccess);
  const beforeAbandonedRestore =
    mocks.recoverCaptureSurfaces.mock.calls[0]?.[0]?.beforeAbandonedRestore;
  if (!beforeAbandonedRestore) throw new Error('Expected abandoned-surface cleanup hook');

  await beforeAbandonedRestore({
    generation: 4,
    owner: 'video',
    sessionId: 'recording-abandoned',
    tabId: 9,
    target: 'viewport',
  });

  expect(mocks.ensurePageAccess).toHaveBeenCalledWith(
    9,
    'Recording page access is required to remove an abandoned viewport cursor projection.'
  );
  expect(mocks.retireViewportCursorProjectionAuthority).toHaveBeenCalledWith(9, {
    generation: 4,
    recordingId: 'recording-abandoned',
  });
  expect(mocks.retireViewportCursorProjectionAuthority.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.ensurePageAccess.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );
  expect(mocks.ensurePageAccess.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.disableViewportCursorProjection.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );
  expect(mocks.disableViewportCursorProjection).toHaveBeenCalledWith(9, {
    generation: 4,
    recordingId: 'recording-abandoned',
  });
});

it('does not apply stale startup geometry after the recovered binding is replaced', async () => {
  let resolveViewport!: (viewport: {
    devicePixelRatio: number;
    height: number;
    scrollX: number;
    scrollY: number;
    visualViewportScale: number;
    width: number;
  }) => void;
  mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
    captureMode: CaptureMode.TAB_CROP,
    recordingId: 'recording-stale-geometry',
    recordingTabId: 9,
    phase: 'active',
    surfaceBinding: { generation: 4, streamInstanceId: 'stream-recovered' },
    viewportPresetId: null,
  });
  mocks.getAppliedForSession.mockReturnValue(null);
  mocks.readTabCaptureViewport.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveViewport = resolve;
    })
  );

  const recovery = recoverVideoCaptureSurfaceOnStartup(mocks.ensurePageAccess);
  await vi.waitFor(() => expect(mocks.readTabCaptureViewport).toHaveBeenCalledOnce());
  storeVideoSurfaceSession({
    applied: null,
    generation: 5,
    recordingId: 'recording-stale-geometry',
    sourceReady: true,
    sourceVideoHeight: null,
    sourceVideoWidth: null,
    streamInstanceId: 'stream-replacement',
    tabId: 9,
  });
  resolveViewport({
    devicePixelRatio: 1,
    height: 900,
    scrollX: 0,
    scrollY: 0,
    visualViewportScale: 1,
    width: 1440,
  });

  await expect(recovery).rejects.toThrow(
    'Recovered recording binding changed while page geometry was refreshed'
  );
  expect(
    mocks.sendRuntimeMessage.mock.calls.some(
      ([message]) => message.type === 'OFFSCREEN_REVALIDATE_SOURCE'
    )
  ).toBe(false);
  expect(
    mocks.sendRuntimeMessage.mock.calls.some(
      ([message]) => message.type === 'OFFSCREEN_STOP_RECORDING'
    )
  ).toBe(false);
  expect(mocks.clearActiveLease).not.toHaveBeenCalled();
});
