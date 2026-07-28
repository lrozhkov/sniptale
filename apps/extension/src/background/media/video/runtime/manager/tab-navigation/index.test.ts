import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  captureMode: 'TAB' as CaptureMode,
  deferRecovery: vi.fn(),
  effects: { controlledCursor: false, cropOverlay: false },
  getRecordingId: vi.fn(),
  getRecordingTabId: vi.fn(),
  getRuntimeState: vi.fn(),
  getSurfaceSession: vi.fn(),
  reassertViewport: vi.fn(),
  restoreEffects: vi.fn(),
  revalidateSource: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  setRuntimeState: vi.fn(),
  stop: vi.fn(),
  suspendEffects: vi.fn(),
}));

vi.mock('../../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface')>()),
  deferVideoCaptureSurfaceWorkUntilRecovery: mocks.deferRecovery,
  getVideoSurfaceSession: mocks.getSurfaceSession,
}));
vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  getVideoRecordingCaptureMode: () => mocks.captureMode,
  getVideoRecordingId: mocks.getRecordingId,
  getVideoRecordingTabId: mocks.getRecordingTabId,
}));
vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  getVideoRecordingRuntimeState: mocks.getRuntimeState,
  setVideoRecordingRuntimeState: mocks.setRuntimeState,
}));
vi.mock('../../../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.sendRuntimeMessage }),
}));
vi.mock('../controls.stop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../controls.stop')>()),
  stopRecording: mocks.stop,
}));
vi.mock('./page-effects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./page-effects')>()),
  resolveTabNavigationPageEffects: () => mocks.effects,
  restoreTabNavigationPageEffects: mocks.restoreEffects,
  suspendTabNavigationPageEffects: mocks.suspendEffects,
}));
vi.mock('./source-validation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./source-validation')>()),
  reassertViewportSurface: mocks.reassertViewport,
  revalidateTabSource: mocks.revalidateSource,
}));

import {
  handleTabRecordingDebuggerDetach,
  handleTabRecordingNavigationCommitted,
  handleTabRecordingNavigationCompleted,
  handleTabRecordingNavigationError,
  handleTabRecordingNavigationStart,
  isTabRecordingNavigationPending,
  markTabRecordingManuallyPaused,
  resetTabRecordingNavigationForTests,
} from '.';

const viewportSurface = {
  generation: 1,
  height: 720,
  leaseId: 'lease-1',
  presetId: 'preset-1',
  sessionId: 'recording-1',
  target: 'viewport' as const,
  width: 1280,
};

type TestAppliedSurface = Omit<typeof viewportSurface, 'target'> & {
  target: 'viewport' | 'window';
};

function createSurfaceSession(applied: TestAppliedSurface | null = viewportSurface) {
  return {
    applied,
    generation: 1,
    recordingId: 'recording-1',
    sourceVideoHeight: 1440,
    sourceVideoWidth: 2560,
    streamInstanceId: 'stream-1',
    tabId: 7,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetTabRecordingNavigationForTests();
  mocks.captureMode = CaptureMode.TAB;
  mocks.effects = { controlledCursor: false, cropOverlay: false };
  mocks.deferRecovery.mockReturnValue(false);
  mocks.getRecordingId.mockReturnValue('recording-1');
  mocks.getRecordingTabId.mockReturnValue(7);
  mocks.getRuntimeState.mockReturnValue({
    captureMode: CaptureMode.TAB,
    status: VideoRecordingStatus.RECORDING,
  });
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession());
  mocks.reassertViewport.mockResolvedValue(undefined);
  mocks.restoreEffects.mockResolvedValue({
    controlledCursorRestored: true,
    liveViewport: {
      devicePixelRatio: 2,
      height: 720,
      scrollX: 0,
      scrollY: 0,
      width: 1280,
    },
  });
  mocks.revalidateSource.mockResolvedValue(undefined);
  mocks.sendRuntimeMessage.mockResolvedValue({ success: true });
  mocks.stop.mockResolvedValue({ result: 'accepted' });
  mocks.suspendEffects.mockResolvedValue(undefined);
});

it('pauses and revalidates plain TAB navigation without page-owned effects', async () => {
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession(null));

  expect(handleTabRecordingNavigationStart(7)).toBe(true);
  expect(handleTabRecordingNavigationCommitted(7, 'document-1')).toBe(true);
  expect(handleTabRecordingNavigationCompleted(7, 'document-1')).toBe(true);
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.restoreEffects).toHaveBeenCalledOnce();
  expect(mocks.revalidateSource).toHaveBeenCalledOnce();
  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_PAUSE_RECORDING })
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_RESUME_RECORDING })
  );
});

it('revalidates a window-preset TAB recording without reasserting viewport metrics', async () => {
  mocks.getSurfaceSession.mockReturnValue(
    createSurfaceSession({ ...viewportSurface, target: 'window' })
  );

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.reassertViewport).not.toHaveBeenCalled();
  expect(mocks.revalidateSource).toHaveBeenCalledOnce();
});

it('stops instead of resuming when plain TAB source revalidation fails', async () => {
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession(null));
  mocks.revalidateSource.mockRejectedValueOnce(new Error('raw geometry changed'));

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledWith(false));

  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_RESUME_RECORDING })
  );
});

it('defers every navigation signal while capture-surface recovery owns startup', () => {
  mocks.deferRecovery.mockImplementation((_work: () => void, onError: (error: unknown) => void) => {
    onError(new Error('recovery failed'));
    return true;
  });

  expect(handleTabRecordingNavigationStart(7)).toBe(true);
  expect(handleTabRecordingNavigationCommitted(7, 'document-1')).toBe(true);
  expect(handleTabRecordingNavigationCompleted(7, 'document-1')).toBe(true);
  expect(handleTabRecordingNavigationError(7, 'document-1')).toBe(true);
  expect(handleTabRecordingDebuggerDetach(7)).toBe(true);
  expect(mocks.deferRecovery).toHaveBeenCalledTimes(5);
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
});

it('pauses viewport recording until the committed document completes and validates', async () => {
  const order: string[] = [];
  mocks.sendRuntimeMessage.mockImplementation(async (message: { type: string }) => {
    order.push(message.type);
    return { success: true };
  });
  mocks.reassertViewport.mockImplementation(async () => order.push('surface'));
  mocks.revalidateSource.mockImplementation(async () => order.push('source'));

  expect(handleTabRecordingNavigationStart(7)).toBe(true);
  expect(handleTabRecordingNavigationCommitted(7, 'document-1')).toBe(true);
  expect(handleTabRecordingNavigationCompleted(7, 'document-1')).toBe(true);
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(order).toEqual([
    VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
    'surface',
    'source',
    VideoMessageType.OFFSCREEN_RESUME_RECORDING,
  ]);
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('keeps TAB_CROP paused until its page effects and exact source mapping are restored', async () => {
  mocks.captureMode = CaptureMode.TAB_CROP;
  mocks.effects = { controlledCursor: false, cropOverlay: true };
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession(null));

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.restoreEffects).toHaveBeenCalledOnce();
  expect(mocks.revalidateSource).toHaveBeenCalledOnce();
  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_PAUSE_RECORDING })
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_RESUME_RECORDING })
  );
});

it('does not let stale completion A finish navigation B', async () => {
  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-a');
  await vi.waitFor(() => expect(mocks.sendRuntimeMessage).toHaveBeenCalledOnce());

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-b');
  expect(handleTabRecordingNavigationCompleted(7, 'document-a')).toBe(false);
  expect(handleTabRecordingNavigationCompleted(7, 'document-b')).toBe(true);
  expect(handleTabRecordingNavigationCompleted(7, 'document-b')).toBe(true);
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.reassertViewport).toHaveBeenCalledOnce();
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledTimes(2);
});

it('keeps a manually paused recording paused after navigation', async () => {
  handleTabRecordingNavigationStart(7);
  markTabRecordingManuallyPaused();
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_PAUSE_RECORDING })
  );
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_RESUME_RECORDING })
  );
});

it('does not let debugger detach race the active document completion', async () => {
  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  expect(handleTabRecordingDebuggerDetach(7)).toBe(true);
  expect(mocks.reassertViewport).not.toHaveBeenCalled();

  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(mocks.reassertViewport).toHaveBeenCalledOnce());
});

it('reasserts immediately when debugger detaches outside navigation', async () => {
  expect(handleTabRecordingDebuggerDetach(7)).toBe(true);
  await vi.waitFor(() => expect(mocks.reassertViewport).toHaveBeenCalledOnce());
  expect(mocks.revalidateSource).toHaveBeenCalledOnce();
});

it('reconciles an explicit navigation error through the same single completion', async () => {
  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  expect(handleTabRecordingNavigationError(7, 'document-1')).toBe(true);
  expect(handleTabRecordingNavigationError(7, 'document-1')).toBe(true);
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));
  expect(mocks.reassertViewport).toHaveBeenCalledOnce();
});

it('stops and preserves controlled-cursor recording when page bootstrap is unavailable', async () => {
  mocks.effects = { controlledCursor: true, cropOverlay: false };
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession(null));
  mocks.restoreEffects.mockResolvedValue({
    controlledCursorRestored: false,
    liveViewport: null,
  });

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledWith(false));

  expect(isTabRecordingNavigationPending()).toBe(false);
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_RESUME_RECORDING })
  );
});

it('stops and preserves the recording when exact source restoration fails', async () => {
  mocks.revalidateSource.mockRejectedValueOnce(new Error('mapping changed'));
  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');

  await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledWith(false));
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_RESUME_RECORDING })
  );
});
