import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  cursorEnabled: false,
  ensurePageAccess: vi.fn(),
  getRuntimeState: vi.fn(),
  loggerWarn: vi.fn(),
  readViewport: vi.fn(),
  restoreCursor: vi.fn(),
  restoreOverlay: vi.fn(),
  suspendCursor: vi.fn(),
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
vi.mock('../controlled-cursor/navigation-effects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../controlled-cursor/navigation-effects')>()),
  restoreControlledCursorEffects: mocks.restoreCursor,
  suspendControlledCursorEffects: mocks.suspendCursor,
}));

import {
  resolveTabNavigationPageEffects,
  restoreTabNavigationPageEffects,
  suspendTabNavigationPageEffects,
} from './page-effects';

const binding = {
  isCurrent: () => true,
  recordingId: 'recording-1',
  shouldResume: true,
  tabId: 7,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cursorEnabled = false;
  mocks.ensurePageAccess.mockResolvedValue(undefined);
  mocks.getRuntimeState.mockReturnValue({ captureMode: CaptureMode.TAB, cropRegion: null });
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
  mocks.suspendCursor.mockResolvedValue(undefined);
});

it('resolves only page-owned effects and does nothing for plain TAB', async () => {
  const effects = resolveTabNavigationPageEffects();
  expect(effects).toEqual({ controlledCursor: false, cropOverlay: false });

  await suspendTabNavigationPageEffects(effects, binding);
  await restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess);
  expect(mocks.ensurePageAccess).not.toHaveBeenCalled();
  expect(mocks.suspendCursor).not.toHaveBeenCalled();
});

it('uses canonical page access before restoring cursor and crop overlay', async () => {
  mocks.cursorEnabled = true;
  mocks.getRuntimeState.mockReturnValue({
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: { x: 10, y: 20, width: 300, height: 300 },
  });
  const effects = resolveTabNavigationPageEffects();

  await suspendTabNavigationPageEffects(effects, binding);
  await restoreTabNavigationPageEffects(effects, binding, mocks.ensurePageAccess);

  expect(mocks.suspendCursor).toHaveBeenCalledWith(binding);
  expect(mocks.ensurePageAccess).toHaveBeenCalledWith(7, expect.any(String));
  expect(mocks.restoreCursor).toHaveBeenCalledWith(binding);
  expect(mocks.restoreOverlay).toHaveBeenCalledWith(
    7,
    { x: 10, y: 20, width: 300, height: 300 },
    binding.isCurrent,
    [0, 100, 250, 500, 1000, 2000]
  );
});

it('fails closed when required crop page access or cursor restoration is unavailable', async () => {
  const effects = { controlledCursor: true, cropOverlay: true };
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
      { controlledCursor: false, cropOverlay: true },
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
      { controlledCursor: false, cropOverlay: true },
      binding,
      mocks.ensurePageAccess
    )
  ).rejects.toThrow('overlay could not be restored');
});
