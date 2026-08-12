import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  abandonCursor: vi.fn(),
  beginCursor: vi.fn(),
  beginSurfaceRebind: vi.fn(),
  closeCameraPeer: vi.fn(),
  cursorEnabled: false,
  ensurePageAccess: vi.fn(),
  enableViewportCursorProjection: vi.fn(),
  getRuntimeState: vi.fn(),
  loggerWarn: vi.fn(),
  loadVideoSettings: vi.fn(),
  readViewport: vi.fn(),
  restoreCursor: vi.fn(),
  restoreOverlay: vi.fn(),
  sendTabMessage: vi.fn(),
  suspendCursor: vi.fn(),
  surfaceLease: null as null | Record<string, unknown>,
  updateSurface: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ warn: mocks.loggerWarn }),
}));
vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  getVideoRecordingRuntimeState: mocks.getRuntimeState,
}));
vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  isControlledCursorCaptureEnabled: () => mocks.cursorEnabled,
}));
vi.mock('../../../ui/overlay-restore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/overlay-restore')>()),
  restoreRecordingOverlayAfterNavigation: mocks.restoreOverlay,
}));
vi.mock('../../../capture-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-viewport')>()),
  readTabCaptureViewport: mocks.readViewport,
}));
vi.mock('../../../capture-surface/cursor-projection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface/cursor-projection')>()),
  enableViewportCursorProjection: mocks.enableViewportCursorProjection,
}));
vi.mock('../controlled-cursor/navigation-effects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../controlled-cursor/navigation-effects')>()),
  abandonControlledCursorNavigationEffects: mocks.abandonCursor,
  beginControlledCursorNavigationEffects: mocks.beginCursor,
  restoreControlledCursorEffects: mocks.restoreCursor,
  suspendControlledCursorEffects: mocks.suspendCursor,
}));
vi.mock('../../../content-surface/surface-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content-surface/surface-lease')>()),
  beginVideoRecordingSurfaceRebind: mocks.beginSurfaceRebind,
  getVideoRecordingSurfaceLeaseSnapshot: () => mocks.surfaceLease,
  updateVideoRecordingSurface: mocks.updateSurface,
}));
vi.mock('../../../content-surface/camera-peer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content-surface/camera-peer')>()),
  closeVideoRecordingCameraPeerForLease: mocks.closeCameraPeer,
}));
vi.mock('../../../content-surface/snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content-surface/snapshot')>()),
  createVideoRecordingSurfaceSnapshot: vi.fn(() => ({ lifecycle: 'ready' })),
}));
vi.mock('../../../../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../../composition/persistence/capture-settings')
  >()),
  loadVideoSettings: mocks.loadVideoSettings,
}));
vi.mock('../../../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({ sendTabMessage: mocks.sendTabMessage }),
}));

import {
  abandonTabNavigationPageEffects,
  beginTabNavigationPageEffects,
  resolveTabNavigationPageEffects,
  restoreTabNavigationPageEffects,
  restoreViewportCursorProjectionBeforeThaw,
  suspendTabNavigationPageEffects,
} from './page-effects';

const binding = {
  generation: 4,
  isCurrent: () => true,
  navigationEpoch: 11,
  recordingId: 'recording-1',
  shouldResume: true,
  tabId: 7,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.beginCursor.mockReturnValue(11);
  mocks.beginSurfaceRebind.mockResolvedValue(undefined);
  mocks.closeCameraPeer.mockResolvedValue(undefined);
  mocks.cursorEnabled = false;
  mocks.ensurePageAccess.mockResolvedValue(undefined);
  mocks.enableViewportCursorProjection.mockResolvedValue(undefined);
  mocks.getRuntimeState.mockReturnValue({ captureMode: CaptureMode.TAB, cropRegion: null });
  mocks.loadVideoSettings.mockResolvedValue({});
  mocks.readViewport.mockResolvedValue({
    devicePixelRatio: 2,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    visualViewportOffsetLeft: 0,
    visualViewportOffsetTop: 0,
    visualViewportScale: 1,
    width: 1280,
  });
  mocks.restoreCursor.mockResolvedValue(undefined);
  mocks.restoreOverlay.mockResolvedValue(true);
  mocks.sendTabMessage.mockResolvedValue(undefined);
  mocks.suspendCursor.mockResolvedValue(undefined);
  mocks.surfaceLease = null;
  mocks.updateSurface.mockResolvedValue(undefined);
});

it('resolves only page-owned effects and does nothing for plain TAB', async () => {
  const effects = resolveTabNavigationPageEffects();
  expect(effects).toEqual({
    contentSurface: false,
    controlledCursor: false,
    cropOverlay: false,
    viewportCursorProjection: false,
  });
  expect(beginTabNavigationPageEffects(effects)).toBeNull();

  await suspendTabNavigationPageEffects(effects, binding);
  await restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess);
  expect(mocks.ensurePageAccess).not.toHaveBeenCalled();
  expect(mocks.suspendCursor).not.toHaveBeenCalled();
});

it('suspends and restores the content recording surface across navigation', async () => {
  const lease = {
    capabilityEpoch: 2,
    documentGeneration: 1,
    entry: 'popup',
    lifecycle: 'binding',
    peerGeneration: 2,
    recordingId: 'recording-1',
    surfaceSessionId: 'surface-1',
    surfaceToken: 'token-1',
    tabId: 7,
    toolbarRequested: true,
  };
  mocks.surfaceLease = lease;
  mocks.updateSurface.mockResolvedValue({ ...lease, lifecycle: 'ready' });
  const effects = resolveTabNavigationPageEffects();
  expect(effects.contentSurface).toBe(true);

  await suspendTabNavigationPageEffects(effects, binding);
  expect(mocks.closeCameraPeer).toHaveBeenCalledWith(lease);
  expect(mocks.beginSurfaceRebind).toHaveBeenCalledWith(7);
  await restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess);
  expect(mocks.updateSurface).toHaveBeenCalledWith('surface-1', { lifecycle: 'ready' });
  expect(mocks.sendTabMessage).toHaveBeenCalledWith(
    7,
    expect.objectContaining({
      type: 'VIDEO_RECORDING_SURFACE_SNAPSHOT',
      surfaceToken: 'token-1',
    })
  );
});

it('advances the document generation when stale camera cleanup must be retried', async () => {
  mocks.surfaceLease = {
    recordingId: 'recording-1',
    surfaceSessionId: 'surface-1',
    tabId: 7,
  };
  mocks.closeCameraPeer.mockRejectedValueOnce(new Error('peer unavailable'));
  await suspendTabNavigationPageEffects(
    {
      contentSurface: true,
      controlledCursor: false,
      cropOverlay: false,
      viewportCursorProjection: false,
    },
    binding
  );
  expect(mocks.updateSurface).toHaveBeenCalledWith('surface-1', { lifecycle: 'degraded' });
  expect(mocks.beginSurfaceRebind).toHaveBeenCalledWith(7);
});

it('retries degraded peer cleanup before publishing a rebound surface', async () => {
  const degraded = {
    capabilityEpoch: 1,
    documentGeneration: 0,
    lifecycle: 'degraded',
    peerGeneration: 0,
    recordingId: 'recording-1',
    surfaceSessionId: 'surface-1',
    surfaceToken: 'token-1',
    tabId: 7,
  };
  const rebound = {
    ...degraded,
    capabilityEpoch: 2,
    documentGeneration: 1,
    lifecycle: 'binding',
    peerGeneration: 1,
    surfaceToken: 'token-2',
  };
  mocks.surfaceLease = degraded;
  mocks.beginSurfaceRebind.mockResolvedValueOnce(rebound);
  mocks.updateSurface.mockResolvedValueOnce({ ...rebound, lifecycle: 'ready' });

  await restoreTabNavigationPageEffects(
    {
      contentSurface: true,
      controlledCursor: false,
      cropOverlay: false,
      viewportCursorProjection: false,
    },
    binding,
    mocks.ensurePageAccess
  );

  expect(mocks.closeCameraPeer).toHaveBeenCalledWith(degraded);
  expect(mocks.beginSurfaceRebind).toHaveBeenCalledWith(7);
  expect(mocks.sendTabMessage).toHaveBeenCalledWith(
    7,
    expect.objectContaining({ surfaceToken: 'token-2' })
  );
});

it('restores the toolbar in degraded state while failed camera cleanup remains queued', async () => {
  const degraded = {
    capabilityEpoch: 1,
    documentGeneration: 0,
    lifecycle: 'degraded',
    peerGeneration: 0,
    recordingId: 'recording-1',
    surfaceSessionId: 'surface-1',
    surfaceToken: 'token-1',
    tabId: 7,
    toolbarRequested: true,
  };
  const rebound = {
    ...degraded,
    capabilityEpoch: 2,
    documentGeneration: 1,
    lifecycle: 'binding',
    peerGeneration: 1,
    surfaceToken: 'token-2',
  };
  mocks.surfaceLease = degraded;
  mocks.closeCameraPeer.mockRejectedValueOnce(new Error('offscreen unavailable'));
  mocks.beginSurfaceRebind.mockResolvedValueOnce(rebound);
  mocks.updateSurface.mockResolvedValueOnce({ ...rebound, lifecycle: 'degraded' });

  await restoreTabNavigationPageEffects(
    {
      contentSurface: true,
      controlledCursor: false,
      cropOverlay: false,
      viewportCursorProjection: false,
    },
    binding,
    mocks.ensurePageAccess
  );

  expect(mocks.updateSurface).toHaveBeenCalledWith('surface-1', { lifecycle: 'degraded' });
  expect(mocks.sendTabMessage).toHaveBeenCalledWith(
    7,
    expect.objectContaining({ surfaceToken: 'token-2' })
  );
});

it('restores viewport cursor projection after canonical page access without making failure critical', async () => {
  const effects = resolveTabNavigationPageEffects(true);

  await expect(
    restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess)
  ).resolves.toEqual({ controlledCursorRestored: true, liveViewport: null });
  expect(mocks.ensurePageAccess).toHaveBeenCalledWith(7, expect.any(String));
  expect(mocks.enableViewportCursorProjection).toHaveBeenCalledWith(7, {
    generation: 4,
    recordingId: 'recording-1',
  });

  mocks.enableViewportCursorProjection.mockRejectedValueOnce(new Error('receiver unavailable'));
  await expect(
    restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess)
  ).resolves.toEqual({ controlledCursorRestored: true, liveViewport: null });
  expect(mocks.loggerWarn).toHaveBeenCalledWith(
    'Viewport cursor projection could not be restored after navigation',
    expect.any(Error)
  );
});

it('prepares viewport cursor projection before thaw and keeps preparation fail-soft', async () => {
  const effects = resolveTabNavigationPageEffects(true);

  await restoreViewportCursorProjectionBeforeThaw(effects, binding, mocks.ensurePageAccess);
  expect(mocks.ensurePageAccess).toHaveBeenCalledWith(7, expect.any(String));
  expect(mocks.enableViewportCursorProjection).toHaveBeenCalledWith(7, {
    generation: 4,
    recordingId: 'recording-1',
  });
  expect(mocks.ensurePageAccess.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.enableViewportCursorProjection.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );

  mocks.ensurePageAccess.mockRejectedValueOnce(new Error('receiver unavailable'));
  mocks.enableViewportCursorProjection.mockClear();
  await expect(
    restoreViewportCursorProjectionBeforeThaw(effects, binding, mocks.ensurePageAccess)
  ).resolves.toBeUndefined();
  expect(mocks.enableViewportCursorProjection).not.toHaveBeenCalled();
  expect(mocks.loggerWarn).toHaveBeenCalledWith(
    'Viewport cursor projection could not be prepared before output resumed',
    expect.any(Error)
  );
});

it('does not restore viewport projection after page access outlives its binding', async () => {
  let resolvePageAccess!: () => void;
  let current = true;
  const delayedAccess = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolvePageAccess = resolve;
      })
  );
  const staleBinding = { ...binding, isCurrent: () => current };

  const restoration = restoreTabNavigationPageEffects(
    resolveTabNavigationPageEffects(true),
    staleBinding,
    delayedAccess
  );
  await vi.waitFor(() => expect(delayedAccess).toHaveBeenCalledOnce());
  current = false;
  resolvePageAccess();
  await restoration;

  expect(mocks.enableViewportCursorProjection).not.toHaveBeenCalled();
});

it('uses canonical page access before restoring cursor and crop overlay', async () => {
  mocks.cursorEnabled = true;
  mocks.getRuntimeState.mockReturnValue({
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: { x: 10, y: 20, width: 300, height: 300 },
  });
  const effects = resolveTabNavigationPageEffects();
  expect(beginTabNavigationPageEffects(effects)).toBe(11);

  await suspendTabNavigationPageEffects(effects, binding);
  await restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess);

  expect(mocks.suspendCursor).toHaveBeenCalledWith(binding);
  expect(mocks.beginCursor).toHaveBeenCalledOnce();
  expect(mocks.ensurePageAccess).toHaveBeenCalledWith(7, expect.any(String));
  expect(mocks.restoreCursor).toHaveBeenCalledWith(binding);
  expect(mocks.restoreOverlay).toHaveBeenCalledWith(
    7,
    { x: 10, y: 20, width: 300, height: 300 },
    binding.isCurrent,
    [0, 100, 250, 500, 1000, 2000]
  );
});

it('delegates token-scoped controlled-cursor cleanup on abandonment', () => {
  const effects = {
    controlledCursor: true,
    cropOverlay: false,
    viewportCursorProjection: false,
  };

  abandonTabNavigationPageEffects(effects, binding);

  expect(mocks.abandonCursor).toHaveBeenCalledWith(binding);
});

it('fails closed when required crop page access or cursor restoration is unavailable', async () => {
  const effects = {
    controlledCursor: true,
    cropOverlay: true,
    viewportCursorProjection: false,
  };
  mocks.ensurePageAccess.mockRejectedValueOnce(new Error('activeTab revoked'));
  await expect(
    restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess)
  ).rejects.toThrow('Recording region could not be restored');
  expect(mocks.restoreCursor).not.toHaveBeenCalled();
  expect(mocks.restoreOverlay).not.toHaveBeenCalled();

  mocks.ensurePageAccess.mockResolvedValue(undefined);
  mocks.restoreCursor.mockRejectedValueOnce(new Error('cursor unavailable'));
  mocks.getRuntimeState.mockReturnValue({ captureMode: CaptureMode.TAB_CROP, cropRegion: null });
  await expect(
    restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess)
  ).resolves.toEqual({
    controlledCursorRestored: false,
    liveViewport: expect.objectContaining({ height: 720, width: 1280 }),
  });
  expect(mocks.loggerWarn).toHaveBeenCalled();
});

it('fails crop-only restoration when the page runtime is unavailable', async () => {
  mocks.ensurePageAccess.mockRejectedValueOnce(new Error('activeTab revoked'));
  await expect(
    restoreTabNavigationPageEffects(
      { controlledCursor: false, cropOverlay: true, viewportCursorProjection: false },
      binding,
      mocks.ensurePageAccess
    )
  ).rejects.toThrow('Recording region could not be restored');
});

it('fails crop restoration when the overlay cannot be restored', async () => {
  mocks.getRuntimeState.mockReturnValue({
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: { x: 10, y: 20, width: 300, height: 300 },
  });
  mocks.restoreOverlay.mockResolvedValueOnce(false);

  await expect(
    restoreTabNavigationPageEffects(
      { controlledCursor: false, cropOverlay: true, viewportCursorProjection: false },
      binding,
      mocks.ensurePageAccess
    )
  ).rejects.toThrow('overlay could not be restored');
});
