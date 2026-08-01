import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  abandonEffects: vi.fn(),
  beginEffects: vi.fn(),
  captureMode: 'TAB' as CaptureMode,
  createTransitionId: vi.fn(),
  deferRecovery: vi.fn(),
  effects: { controlledCursor: false, cropOverlay: false, viewportCursorProjection: false },
  getRecordingId: vi.fn(),
  getRecordingTabId: vi.fn(),
  getRuntimeState: vi.fn(),
  getSurfaceSession: vi.fn(),
  pageAccessVerifier: vi.fn(),
  reassertViewport: vi.fn(),
  resolveEffects: vi.fn(),
  restoreEffects: vi.fn(),
  restoreViewportProjection: vi.fn(),
  revalidateSource: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  setRuntimeState: vi.fn(),
  stop: vi.fn(),
  suspendEffects: vi.fn(),
}));

vi.mock('@sniptale/platform/security/secure-random-id', () => ({
  createSecureRandomUuid: mocks.createTransitionId,
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
  resolveTabNavigationPageEffects: mocks.resolveEffects,
  restoreTabNavigationPageEffects: mocks.restoreEffects,
  restoreViewportCursorProjectionBeforeThaw: mocks.restoreViewportProjection,
  suspendTabNavigationPageEffects: mocks.suspendEffects,
}));
vi.mock('./source-validation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./source-validation')>()),
  reassertViewportSurface: mocks.reassertViewport,
  revalidateTabSource: mocks.revalidateSource,
}));

import {
  handleTabRecordingDebuggerDetach as handleTabRecordingDebuggerDetachWithPageAccess,
  handleTabRecordingNavigationCommitted,
  handleTabRecordingNavigationCompleted as handleTabRecordingNavigationCompletedWithPageAccess,
  handleTabRecordingNavigationError as handleTabRecordingNavigationErrorWithPageAccess,
  handleTabRecordingNavigationStart,
  isTabRecordingNavigationPending,
  markTabRecordingManuallyPaused,
  resetTabRecordingNavigationForTests,
} from '.';

function handleTabRecordingDebuggerDetach(tabId: number): boolean {
  return handleTabRecordingDebuggerDetachWithPageAccess(tabId, mocks.pageAccessVerifier);
}

function handleTabRecordingNavigationCompleted(tabId: number, documentId: string): boolean {
  return handleTabRecordingNavigationCompletedWithPageAccess(
    tabId,
    documentId,
    mocks.pageAccessVerifier
  );
}

function handleTabRecordingNavigationError(tabId: number, documentId: string): boolean {
  return handleTabRecordingNavigationErrorWithPageAccess(
    tabId,
    documentId,
    mocks.pageAccessVerifier
  );
}

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
    sourceReady: true,
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
  mocks.createTransitionId.mockReset();
  mocks.createTransitionId
    .mockReturnValueOnce('navigation-1')
    .mockReturnValueOnce('navigation-2')
    .mockReturnValue('navigation-3');
  mocks.effects = {
    controlledCursor: false,
    cropOverlay: false,
    viewportCursorProjection: false,
  };
  mocks.deferRecovery.mockReturnValue(false);
  mocks.getRecordingId.mockReturnValue('recording-1');
  mocks.getRecordingTabId.mockReturnValue(7);
  mocks.getRuntimeState.mockReturnValue({
    captureMode: CaptureMode.TAB,
    status: VideoRecordingStatus.RECORDING,
  });
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession());
  mocks.pageAccessVerifier.mockResolvedValue(undefined);
  mocks.reassertViewport.mockResolvedValue(undefined);
  mocks.resolveEffects.mockImplementation(() => mocks.effects);
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
  mocks.restoreViewportProjection.mockResolvedValue(true);
  mocks.revalidateSource.mockResolvedValue(undefined);
  mocks.sendRuntimeMessage.mockImplementation(async (message: { type: string }) =>
    message.type === VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE
      ? { success: true, result: 'applied' }
      : { success: true }
  );
  mocks.stop.mockResolvedValue({ result: 'accepted' });
  mocks.suspendEffects.mockResolvedValue(undefined);
});

it('guards ordinary full TAB output with an exact navigation transition', async () => {
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession(null));

  expect(handleTabRecordingNavigationStart(7)).toBe(true);
  expect(handleTabRecordingNavigationCommitted(7, 'document-1')).toBe(true);
  expect(handleTabRecordingNavigationCompleted(7, 'document-1')).toBe(true);
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.restoreEffects).toHaveBeenCalledOnce();
  expect(mocks.revalidateSource).toHaveBeenCalledOnce();
  expectViewportDrawStates([true, false]);
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

it('stops ordinary full TAB when exact source revalidation is unavailable', async () => {
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession(null));
  mocks.revalidateSource.mockRejectedValueOnce(new Error('raw geometry changed'));

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.stop).toHaveBeenCalledOnce();
  expectViewportDrawStates([true]);
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
    return { success: true, result: 'applied' };
  });
  mocks.reassertViewport.mockImplementation(async () => order.push('surface'));
  mocks.pageAccessVerifier.mockImplementation(async () => order.push('access'));
  mocks.revalidateSource.mockImplementation(async () => order.push('source'));
  mocks.restoreViewportProjection.mockImplementation(async () => {
    order.push('projection');
    return true;
  });
  mocks.restoreEffects.mockImplementation(async () => {
    order.push('page');
    return { controlledCursorRestored: true, liveViewport: null };
  });

  expect(handleTabRecordingNavigationStart(7)).toBe(true);
  expect(handleTabRecordingNavigationCommitted(7, 'document-1')).toBe(true);
  expect(handleTabRecordingNavigationCompleted(7, 'document-1')).toBe(true);
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(order).toEqual([
    VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
    'surface',
    'access',
    'projection',
    'source',
    VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
    'page',
  ]);
  expect(mocks.revalidateSource).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'recording-1' }),
    null,
    'navigation-1'
  );
  expectViewportDrawStates([true, false]);
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('stops exact viewport output before source validation when page access cannot be restored', async () => {
  mocks.pageAccessVerifier.mockRejectedValueOnce(new Error('page access unavailable'));

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.pageAccessVerifier).toHaveBeenCalledWith(
    7,
    'Recording page access is required to restore exact tab output.'
  );
  expect(mocks.revalidateSource).not.toHaveBeenCalled();
  expectViewportDrawStates([true]);
  expect(mocks.stop).toHaveBeenCalledOnce();
});

it('stops a viewport recording instead of leaving output frozen after source validation fails', async () => {
  mocks.revalidateSource.mockRejectedValueOnce(
    new Error('Raw recording source dimensions changed after navigation')
  );

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expectViewportDrawStates([true]);
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.setRuntimeState).toHaveBeenCalledWith(
    expect.objectContaining({
      error: 'Raw recording source dimensions changed after navigation',
    })
  );
});

it('compensates with the same viewport thaw when the critical bound stop is rejected', async () => {
  mocks.revalidateSource.mockRejectedValueOnce(
    new Error('Raw recording source dimensions changed')
  );
  mocks.stop.mockResolvedValueOnce({ error: 'stop transport unavailable', result: 'failed' });

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.stop).toHaveBeenCalledOnce();
  expectViewportDrawStates([true, false]);
  const transitions = mocks.sendRuntimeMessage.mock.calls.map(([message]) => message.transitionId);
  expect(transitions).toEqual(['navigation-1', 'navigation-1']);
  expect(mocks.setRuntimeState).toHaveBeenCalledWith(
    expect.objectContaining({ error: 'Raw recording source dimensions changed' })
  );
});

it('retains viewport transition authority when both critical stop and compensating thaw fail', async () => {
  mocks.revalidateSource.mockRejectedValueOnce(
    new Error('Raw recording source dimensions changed')
  );
  mocks.stop.mockResolvedValueOnce({ error: 'stop transport unavailable', result: 'failed' });
  mocks.sendRuntimeMessage.mockImplementation(
    (message: {
      frozen?: boolean;
      type: string;
    }): Promise<{ result: 'applied'; success: true } | undefined> =>
      Promise.resolve(
        message.type === VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE &&
          message.frozen === false
          ? undefined
          : { success: true, result: 'applied' }
      )
  );

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expectViewportDrawStates([true, false, false]));

  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(isTabRecordingNavigationPending()).toBe(true);
});

it('retries an ambiguous viewport thaw and stops when it cannot be acknowledged', async () => {
  mocks.sendRuntimeMessage.mockImplementation(
    (message: {
      frozen?: boolean;
      type: string;
    }): Promise<{ result: 'applied'; success: true } | undefined> =>
      Promise.resolve(
        message.type === VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE &&
          message.frozen === false
          ? undefined
          : { success: true, result: 'applied' }
      )
  );

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expectViewportDrawStates([true, false, false]);
  expect(mocks.stop).toHaveBeenCalledOnce();
});

it('freezes viewport output before navigation and reasserts it at document commit', async () => {
  expect(handleTabRecordingNavigationStart(7)).toBe(true);
  expect(mocks.resolveEffects).toHaveBeenCalledWith(true);
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

it('dispatches the first viewport freeze without an empty promise-queue delay', async () => {
  expect(handleTabRecordingNavigationStart(7)).toBe(true);
  const statesAtReturn = mocks.sendRuntimeMessage.mock.calls.map(([message]) => message.frozen);

  await vi.waitFor(() => expectViewportDrawStates([true]));
  expect(statesAtReturn).toEqual([true]);
});

it('retries an explicitly rejected initial viewport freeze before recovery', async () => {
  mocks.sendRuntimeMessage
    .mockResolvedValueOnce({ error: 'freeze denied', success: false })
    .mockResolvedValue({ success: true, result: 'applied' });

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

it('fails closed when secure viewport transition identity cannot be created', async () => {
  mocks.createTransitionId.mockReset();
  mocks.createTransitionId.mockImplementationOnce(() => {
    throw new Error('secure random unavailable');
  });

  expect(() => handleTabRecordingNavigationStart(7)).not.toThrow();
  await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledWith(false));

  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
  expect(mocks.reassertViewport).not.toHaveBeenCalled();
  expect(mocks.setRuntimeState).toHaveBeenCalledWith(
    expect.objectContaining({ error: 'secure random unavailable' })
  );
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));
});

it('guards current-size TAB_CROP output with a tokenized navigation transaction', async () => {
  mocks.captureMode = CaptureMode.TAB_CROP;
  mocks.effects = {
    controlledCursor: false,
    cropOverlay: true,
    viewportCursorProjection: false,
  };
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession(null));

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.restoreEffects).toHaveBeenCalledOnce();
  expect(mocks.revalidateSource).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'recording-1' }),
    null,
    'navigation-1'
  );
  expectViewportDrawStates([true, false]);
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('guards window-preset TAB_CROP output without reasserting viewport metrics', async () => {
  mocks.captureMode = CaptureMode.TAB_CROP;
  mocks.getSurfaceSession.mockReturnValue(
    createSurfaceSession({ ...viewportSurface, target: 'window' })
  );

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expect(mocks.reassertViewport).not.toHaveBeenCalled();
  expect(mocks.revalidateSource).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'recording-1' }),
    null,
    'navigation-1'
  );
  expectViewportDrawStates([true, false]);
});

it('stops current-size TAB_CROP when its fresh output mapping cannot be restored', async () => {
  mocks.captureMode = CaptureMode.TAB_CROP;
  mocks.getSurfaceSession.mockReturnValue(createSurfaceSession(null));
  mocks.revalidateSource.mockRejectedValueOnce(new Error('Fresh crop geometry is unavailable'));

  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expectViewportDrawStates([true]);
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.setRuntimeState).toHaveBeenCalledWith(
    expect.objectContaining({ error: 'Fresh crop geometry is unavailable' })
  );
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

  expect(mocks.reassertViewport).toHaveBeenCalledOnce();
  expectViewportDrawStates([true, true, false]);
  const transitions = mocks.sendRuntimeMessage.mock.calls.map(([message]) => message.transitionId);
  expect(transitions).toEqual(['navigation-1', 'navigation-2', 'navigation-2']);
});

it('serializes superseding viewport freezes so an older command cannot arrive last', async () => {
  let resolveFirstFreeze!: () => void;
  let firstFreezePending = true;
  mocks.sendRuntimeMessage.mockImplementation(
    (message: {
      frozen?: boolean;
      type: string;
    }): Promise<{ result: 'applied'; success: true }> => {
      if (
        message.type === VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE &&
        message.frozen === true &&
        firstFreezePending
      ) {
        firstFreezePending = false;
        return new Promise((resolve) => {
          resolveFirstFreeze = () => resolve({ success: true, result: 'applied' });
        });
      }
      return Promise.resolve({ success: true, result: 'applied' });
    }
  );

  handleTabRecordingNavigationStart(7);
  await vi.waitFor(() => expectViewportDrawStates([true]));

  handleTabRecordingNavigationStart(7);
  await Promise.resolve();
  expectViewportDrawStates([true]);

  resolveFirstFreeze();
  await vi.waitFor(() => expectViewportDrawStates([true, true]));
  handleTabRecordingNavigationCommitted(7, 'document-b');
  handleTabRecordingNavigationCompleted(7, 'document-b');
  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

  expectViewportDrawStates([true, true, false]);
  const transitions = mocks.sendRuntimeMessage.mock.calls.map(([message]) => message.transitionId);
  expect(transitions).toEqual(['navigation-1', 'navigation-2', 'navigation-2']);
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('lets a newer navigation freeze cancel an older pending viewport resume', async () => {
  let resolveFirstResume!: () => void;
  let pendingResumeCreated = false;
  mocks.sendRuntimeMessage.mockImplementation(
    (message: {
      frozen?: boolean;
      type: string;
    }): Promise<{ result: 'applied' | 'stale'; success: true }> => {
      if (
        message.type === VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE &&
        message.frozen === false &&
        !pendingResumeCreated
      ) {
        pendingResumeCreated = true;
        return new Promise((resolve) => {
          resolveFirstResume = () => resolve({ success: true, result: 'stale' });
        });
      }
      return Promise.resolve({ success: true, result: 'applied' });
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
  const transitions = mocks.sendRuntimeMessage.mock.calls.map(([message]) => message.transitionId);
  expect(transitions).toEqual(['navigation-1', 'navigation-1', 'navigation-2', 'navigation-2']);
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
  mocks.effects = {
    controlledCursor: true,
    cropOverlay: false,
    viewportCursorProjection: false,
  };
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
  expectViewportDrawStates([true, false]);
});

it('clears only the current controlled-cursor recovery when page access is unavailable', async () => {
  mocks.effects = {
    controlledCursor: true,
    cropOverlay: false,
    viewportCursorProjection: false,
  };
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
  expectViewportDrawStates([true, false]);
});

it('keeps TAB_CROP recording active when its overlay cannot be restored', async () => {
  mocks.captureMode = CaptureMode.TAB_CROP;
  mocks.effects = {
    controlledCursor: false,
    cropOverlay: true,
    viewportCursorProjection: false,
  };
  mocks.restoreEffects.mockRejectedValueOnce(
    new Error("Could not load file: 'assets/contentRuntime.js'.")
  );
  handleTabRecordingNavigationStart(7);
  handleTabRecordingNavigationCommitted(7, 'document-1');
  handleTabRecordingNavigationCompleted(7, 'document-1');

  await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));
  expect(mocks.revalidateSource).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'recording-1', tabId: 7 }),
    null,
    'navigation-1'
  );
  expect(mocks.revalidateSource.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.restoreEffects.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );
  expect(mocks.stop).not.toHaveBeenCalled();
  expectViewportDrawStates([true, false]);
});
