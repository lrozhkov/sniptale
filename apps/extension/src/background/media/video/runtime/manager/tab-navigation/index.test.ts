import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  abandonEffects: vi.fn(),
  beginEffects: vi.fn(),
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
  abandonTabNavigationPageEffects: mocks.abandonEffects,
  beginTabNavigationPageEffects: mocks.beginEffects,
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

function expectViewportDrawStates(states: boolean[]): void {
  expect(
    mocks.sendRuntimeMessage.mock.calls.map(([message]) => ({
      frozen: message.frozen,
      type: message.type,
    }))
  ).toEqual(
    states.map((frozen) => ({
      frozen,
      type: VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
    }))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetTabRecordingNavigationForTests();
  mocks.beginEffects.mockReturnValue(null);
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

it('keeps plain TAB recording continuous while navigation recovery runs', async () => {
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession(null));

  expect(handleTabRecordingNavigationStart(7)).toBe(true);
  expect(handleTabRecordingNavigationCommitted(7, 'document-1')).toBe(true);
  expect(handleTabRecordingNavigationCompleted(7, 'document-1')).toBe(true);
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.restoreEffects).toHaveBeenCalledOnce();
  expect(mocks.revalidateSource).toHaveBeenCalledOnce();
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
  expect(mocks.stop).not.toHaveBeenCalled();
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

it('keeps plain TAB recording active when source revalidation is unavailable', async () => {
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession(null));
  mocks.revalidateSource.mockRejectedValueOnce(new Error('raw geometry changed'));

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.stop).not.toHaveBeenCalled();
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
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
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('revalidates viewport recording without interrupting the recorder', async () => {
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
    VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
    'surface',
    'source',
    VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
  ]);
  expectViewportDrawStates([true, false]);
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('keeps viewport output frozen when final source validation fails', async () => {
  mocks.revalidateSource.mockRejectedValueOnce(
    new Error('Raw recording source dimensions changed after navigation')
  );

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expectViewportDrawStates([true]);
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('re-freezes viewport output when its resume acknowledgement is missing', async () => {
  mocks.sendRuntimeMessage.mockImplementation(
    (message: { frozen?: boolean; type: string }): Promise<{ success: true } | undefined> =>
      Promise.resolve(
        message.type === VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE &&
          message.frozen === false
          ? undefined
          : { success: true }
      )
  );

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expectViewportDrawStates([true, false, true]);
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('freezes viewport output before navigation and reasserts it at document commit', async () => {
  expect(handleTabRecordingNavigationStart(7)).toBe(true);
  await vi.waitFor(() =>
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        frozen: true,
        generation: 1,
        recordingId: 'recording-1',
        streamInstanceId: 'stream-1',
        type: VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
      })
    )
  );
  expect(mocks.reassertViewport).not.toHaveBeenCalled();

  expect(handleTabRecordingNavigationCommitted(7, 'document-1')).toBe(true);
  await vi.waitFor(() => expect(mocks.reassertViewport).toHaveBeenCalledOnce());
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('retries an explicitly rejected initial viewport freeze before recovery', async () => {
  mocks.sendRuntimeMessage
    .mockResolvedValueOnce({ error: 'freeze denied', success: false })
    .mockResolvedValue({ success: true });

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expectViewportDrawStates([true, true, false]);
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('stops the bound recording when an initial viewport freeze cannot be acknowledged', async () => {
  mocks.sendRuntimeMessage.mockResolvedValue(undefined);

  handleTabRecordingNavigationStart(7);
  await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledWith(false));

  expectViewportDrawStates([true, true]);
  expect(isTabRecordingNavigationPending()).toBe(false);
});

it('keeps TAB_CROP recording continuous while page effects are restored', async () => {
  mocks.captureMode = CaptureMode.TAB_CROP;
  mocks.effects = { controlledCursor: false, cropOverlay: true };
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession(null));

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.restoreEffects).toHaveBeenCalledOnce();
  expect(mocks.revalidateSource).toHaveBeenCalledOnce();
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('does not let stale completion A finish navigation B', async () => {
  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-a');

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-b');
  expect(handleTabRecordingNavigationCompleted(7, 'document-a')).toBe(false);
  expect(handleTabRecordingNavigationCompleted(7, 'document-b')).toBe(true);
  expect(handleTabRecordingNavigationCompleted(7, 'document-b')).toBe(true);
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.reassertViewport).toHaveBeenCalledTimes(2);
  expectViewportDrawStates([true, true, false]);
});

it('lets a newer navigation freeze cancel an older pending viewport resume', async () => {
  let resolveFirstResume!: () => void;
  let pendingResumeCreated = false;
  mocks.sendRuntimeMessage.mockImplementation(
    (message: { frozen?: boolean; type: string }): Promise<{ success: boolean }> => {
      if (
        message.type === VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE &&
        message.frozen === false &&
        !pendingResumeCreated
      ) {
        pendingResumeCreated = true;
        return new Promise((resolve) => {
          resolveFirstResume = () => resolve({ success: true });
        });
      }
      return Promise.resolve({ success: true });
    }
  );

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-a');
  handleTabRecordingNavigationCompleted(7, 'document-a');
  await vi.waitFor(() => expect(pendingResumeCreated).toBe(true));

  handleTabRecordingNavigationStart(7);
  await vi.waitFor(() => expectViewportDrawStates([true, false, true]));
  resolveFirstResume();
  handleTabRecordingNavigationCommitted(7, 'document-b');
  handleTabRecordingNavigationCompleted(7, 'document-b');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expectViewportDrawStates([true, false, true, false]);
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('does not change manual pause state while navigation recovery runs', async () => {
  handleTabRecordingNavigationStart(7);
  markTabRecordingManuallyPaused();
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expectViewportDrawStates([true, false]);
  expect(mocks.stop).not.toHaveBeenCalled();
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

it('keeps TAB recording active when controlled-cursor bootstrap is unavailable', async () => {
  mocks.effects = { controlledCursor: true, cropOverlay: false };
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession(null));
  mocks.restoreEffects.mockResolvedValue({
    controlledCursorRestored: false,
    liveViewport: null,
  });

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.stop).not.toHaveBeenCalled();
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
});

it('clears only the current controlled-cursor recovery when page access is unavailable', async () => {
  mocks.effects = { controlledCursor: true, cropOverlay: false };
  mocks.beginEffects.mockReturnValue(11);
  mocks.restoreEffects.mockRejectedValueOnce(new Error('page access unavailable'));

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.abandonEffects).toHaveBeenCalledWith(
    mocks.effects,
    expect.objectContaining({ navigationEpoch: 11, recordingId: 'recording-1', tabId: 7 })
  );
  expect(mocks.stop).not.toHaveBeenCalled();
  expectViewportDrawStates([true]);
});

it('keeps TAB_CROP recording active when its overlay cannot be restored', async () => {
  mocks.captureMode = CaptureMode.TAB_CROP;
  mocks.effects = { controlledCursor: false, cropOverlay: true };
  mocks.restoreEffects.mockRejectedValueOnce(new Error('page access unavailable'));
  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');

  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));
  expect(mocks.stop).not.toHaveBeenCalled();
  expectViewportDrawStates([true]);
});
