import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  abandonCursor: vi.fn(),
  beginRebind: vi.fn(),
  beginCursor: vi.fn(),
  closeCameraPeer: vi.fn(),
  cursorEnabled: false,
  ensurePageAccess: vi.fn(),
  getRuntimeState: vi.fn(),
  getSurfaceLease: vi.fn(),
  loadVideoSettings: vi.fn(),
  readViewport: vi.fn(),
  restoreCursor: vi.fn(),
  restoreOverlay: vi.fn(),
  sendTabMessage: vi.fn(),
  suspendCursor: vi.fn(),
  updateSurface: vi.fn(),
}));

vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  getVideoRecordingRuntimeState: mocks.getRuntimeState,
}));
vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  isControlledCursorCaptureEnabled: () => mocks.cursorEnabled,
}));
vi.mock('../../../capture-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-viewport')>()),
  readTabCaptureViewport: mocks.readViewport,
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
  beginVideoRecordingSurfaceRebind: mocks.beginRebind,
  getVideoRecordingSurfaceLeaseSnapshot: mocks.getSurfaceLease,
  updateVideoRecordingSurface: mocks.updateSurface,
}));
vi.mock('../../../content-surface/camera-peer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content-surface/camera-peer')>()),
  closeVideoRecordingCameraPeerForLease: mocks.closeCameraPeer,
}));
vi.mock('../../../content-surface/snapshot', () => ({
  createVideoRecordingSurfaceSnapshot: vi.fn(() => ({ lifecycle: 'ready' })),
}));
vi.mock('../../../ui/overlay-restore', () => ({
  restoreRecordingOverlayAfterNavigation: mocks.restoreOverlay,
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
  suspendTabNavigationPageEffects,
} from './page-effects';

const binding = {
  generation: 1,
  isCurrent: () => true,
  navigationEpoch: null,
  recordingId: 'recording-1',
  shouldResume: true,
  tabId: 7,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.beginCursor.mockReturnValue(11);
  mocks.beginRebind.mockResolvedValue(undefined);
  mocks.closeCameraPeer.mockResolvedValue(undefined);
  mocks.cursorEnabled = false;
  mocks.ensurePageAccess.mockResolvedValue(undefined);
  mocks.getRuntimeState.mockReturnValue({ captureMode: CaptureMode.TAB, cropRegion: null });
  mocks.getSurfaceLease.mockReturnValue(null);
  mocks.loadVideoSettings.mockResolvedValue({});
  mocks.readViewport.mockResolvedValue({
    devicePixelRatio: 1,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    visualViewportScale: 1,
    width: 1280,
  });
  mocks.restoreCursor.mockResolvedValue(undefined);
  mocks.restoreOverlay.mockResolvedValue(true);
  mocks.sendTabMessage.mockResolvedValue(undefined);
  mocks.suspendCursor.mockResolvedValue(undefined);
  mocks.updateSurface.mockResolvedValue(undefined);
});

it('does not touch page access for a plain window-sized TAB recording', async () => {
  const effects = resolveTabNavigationPageEffects();
  expect(effects).toEqual({ contentSurface: false, controlledCursor: false, cropOverlay: false });

  await suspendTabNavigationPageEffects(effects, binding);
  await expect(
    restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess)
  ).resolves.toEqual({ controlledCursorRestored: true, liveViewport: null });
  expect(mocks.ensurePageAccess).not.toHaveBeenCalled();
});

it('rebinds an optional content surface without gating the media stream', async () => {
  const lease = {
    lifecycle: 'ready',
    recordingId: binding.recordingId,
    surfaceSessionId: 'surface-1',
    surfaceToken: 'token-1',
    tabId: binding.tabId,
  };
  mocks.getSurfaceLease.mockReturnValue(lease);
  mocks.updateSurface.mockResolvedValue(lease);
  const effects = resolveTabNavigationPageEffects();

  await suspendTabNavigationPageEffects(effects, binding);
  expect(mocks.closeCameraPeer).toHaveBeenCalledWith(lease);
  expect(mocks.beginRebind).toHaveBeenCalledWith(binding.tabId, {
    isCurrent: binding.isCurrent,
  });

  await restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess);
  expect(mocks.ensurePageAccess).toHaveBeenCalledWith(
    binding.tabId,
    expect.stringContaining('page effects')
  );
  expect(mocks.sendTabMessage).toHaveBeenCalledOnce();
});

it('fails only required crop-overlay restoration when page access is unavailable', async () => {
  mocks.getRuntimeState.mockReturnValue({
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: { height: 100, width: 100, x: 0, y: 0 },
  });
  mocks.ensurePageAccess.mockRejectedValue(new Error('receiver unavailable'));

  await expect(
    restoreTabNavigationPageEffects(
      resolveTabNavigationPageEffects(),
      binding,
      mocks.ensurePageAccess
    )
  ).rejects.toThrow('Recording region could not be restored');
});

it('suspends and restores controlled cursor and crop overlay after page access', async () => {
  mocks.cursorEnabled = true;
  mocks.getRuntimeState.mockReturnValue({
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: { height: 100, width: 120, x: 10, y: 20 },
  });
  const effects = resolveTabNavigationPageEffects();
  expect(beginTabNavigationPageEffects(effects)).toBe(11);

  await suspendTabNavigationPageEffects(effects, binding);
  await expect(
    restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess)
  ).resolves.toEqual({
    controlledCursorRestored: true,
    liveViewport: expect.objectContaining({ height: 720, width: 1280 }),
  });

  expect(mocks.suspendCursor).toHaveBeenCalledWith(binding);
  expect(mocks.restoreCursor).toHaveBeenCalledWith(binding);
  expect(mocks.restoreOverlay).toHaveBeenCalledWith(
    7,
    { height: 100, width: 120, x: 10, y: 20 },
    binding.isCurrent,
    [0, 100, 250, 500, 1000, 2000]
  );
});

it('keeps optional controlled-cursor failures isolated from the native stream', async () => {
  mocks.cursorEnabled = true;
  mocks.restoreCursor.mockRejectedValueOnce(new Error('cursor unavailable'));
  const effects = resolveTabNavigationPageEffects();

  await expect(
    restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess)
  ).resolves.toEqual({
    controlledCursorRestored: false,
    liveViewport: expect.objectContaining({ width: 1280 }),
  });
  abandonTabNavigationPageEffects(effects, binding);
  expect(mocks.abandonCursor).toHaveBeenCalledWith(binding);
});

it('still requires the crop overlay when optional controlled-cursor restoration fails', async () => {
  mocks.cursorEnabled = true;
  mocks.getRuntimeState.mockReturnValue({
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: { height: 100, width: 120, x: 10, y: 20 },
  });
  mocks.restoreCursor.mockRejectedValueOnce(new Error('cursor unavailable'));
  mocks.restoreOverlay.mockResolvedValueOnce(false);

  await expect(
    restoreTabNavigationPageEffects(
      resolveTabNavigationPageEffects(),
      binding,
      mocks.ensurePageAccess
    )
  ).rejects.toThrow('overlay could not be restored');

  expect(mocks.restoreCursor).toHaveBeenCalledWith(binding);
  expect(mocks.restoreOverlay).toHaveBeenCalledOnce();
});

it('does not publish page effects after the navigation binding becomes stale', async () => {
  mocks.cursorEnabled = true;
  let current = true;
  let allowAccess!: () => void;
  const staleBinding = { ...binding, isCurrent: () => current };
  const access = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        allowAccess = resolve;
      })
  );
  const restoration = restoreTabNavigationPageEffects(
    resolveTabNavigationPageEffects(),
    staleBinding,
    access
  );
  await vi.waitFor(() => expect(access).toHaveBeenCalledOnce());
  current = false;
  allowAccess();
  await restoration;
  expect(mocks.restoreCursor).not.toHaveBeenCalled();
});

it('marks camera cleanup degraded and retries it before publishing the rebound surface', async () => {
  const degraded = {
    lifecycle: 'degraded',
    recordingId: binding.recordingId,
    surfaceSessionId: 'surface-1',
    surfaceToken: 'token-1',
    tabId: binding.tabId,
  };
  mocks.getSurfaceLease.mockReturnValue(degraded);
  mocks.closeCameraPeer.mockRejectedValueOnce(new Error('peer unavailable'));
  mocks.beginRebind.mockResolvedValueOnce(degraded);
  mocks.updateSurface.mockResolvedValue(degraded);
  const effects = resolveTabNavigationPageEffects();

  await suspendTabNavigationPageEffects(effects, binding);
  await restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess);

  expect(mocks.updateSurface).toHaveBeenCalledWith(
    'surface-1',
    { lifecycle: 'degraded' },
    { isCurrent: binding.isCurrent }
  );
  expect(mocks.sendTabMessage).toHaveBeenCalledOnce();
});

it('fails required crop restoration when geometry or overlay is unavailable', async () => {
  const effects = { contentSurface: false, controlledCursor: false, cropOverlay: true };
  mocks.readViewport.mockRejectedValueOnce(new Error('content unavailable'));
  await expect(
    restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess)
  ).rejects.toThrow('viewport could not be verified');

  mocks.getRuntimeState.mockReturnValue({ captureMode: CaptureMode.TAB_CROP, cropRegion: null });
  await expect(
    restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess)
  ).rejects.toThrow('region is unavailable');
});
