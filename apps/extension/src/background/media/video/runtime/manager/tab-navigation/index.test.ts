import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  defer: vi.fn((_work?: () => void, _onFailure?: (error: unknown) => void) => false),
  resolveBinding: vi.fn(),
  isCurrentBinding: vi.fn(() => true),
  suspendEffects: vi.fn(),
  restoreEffects: vi.fn(),
  abandonEffects: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('../../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface')>()),
  deferVideoCaptureSurfaceWorkUntilRecovery: mocks.defer,
}));
vi.mock('./binding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./binding')>()),
  resolveNavigationBinding: mocks.resolveBinding,
  isCurrentNavigationBinding: mocks.isCurrentBinding,
}));
vi.mock('./page-effects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./page-effects')>()),
  resolveTabNavigationPageEffects: () => ({ controlledCursor: false, cropOverlay: false }),
  beginTabNavigationPageEffects: () => null,
  suspendTabNavigationPageEffects: mocks.suspendEffects,
  restoreTabNavigationPageEffects: mocks.restoreEffects,
  abandonTabNavigationPageEffects: mocks.abandonEffects,
}));
vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  getVideoRecordingRuntimeState: () => ({ status: 'recording' }),
}));
vi.mock('../controls.stop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../controls.stop')>()),
  stopRecording: mocks.stop,
}));

import {
  handleTabRecordingDebuggerDetach,
  handleTabRecordingNavigationCommitted,
  handleTabRecordingNavigationCompleted,
  handleTabRecordingNavigationError,
  handleTabRecordingNavigationStart,
  handleTabRecordingWindowBoundsChanged,
  isTabRecordingNavigationPending,
  markTabRecordingManuallyPaused,
  resetTabRecordingNavigationForTests,
} from '.';

beforeEach(() => {
  vi.clearAllMocks();
  resetTabRecordingNavigationForTests();
  mocks.defer.mockReturnValue(false);
  mocks.isCurrentBinding.mockReturnValue(true);
  mocks.resolveBinding.mockReturnValue({
    captureMode: 'tab',
    generation: 1,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
    tabId: 7,
  });
  mocks.suspendEffects.mockResolvedValue(undefined);
  mocks.restoreEffects.mockResolvedValue({ controlledCursorRestored: true, liveViewport: null });
  mocks.stop.mockResolvedValue({ result: 'accepted' });
});

describe('tab navigation page-effects recovery', () => {
  it('restores page effects without touching or gating the media stream', async () => {
    expect(handleTabRecordingNavigationStart(7)).toBe(true);
    expect(handleTabRecordingNavigationCommitted(7, 'document-1')).toBe(true);
    expect(handleTabRecordingNavigationCompleted(7, 'document-1', vi.fn())).toBe(true);
    await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));
    expect(mocks.suspendEffects).toHaveBeenCalledOnce();
    expect(mocks.restoreEffects).toHaveBeenCalledOnce();
  });

  it('abandons failed optional effects while allowing recording to continue', async () => {
    mocks.restoreEffects.mockRejectedValueOnce(new Error('content unavailable'));
    handleTabRecordingNavigationStart(7);
    handleTabRecordingNavigationCommitted(7, 'document-1');
    handleTabRecordingNavigationCompleted(7, 'document-1', vi.fn());
    await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));
    expect(mocks.abandonEffects).toHaveBeenCalledOnce();
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it('stops the bound TAB_CROP recording when its required overlay cannot be restored', async () => {
    mocks.resolveBinding.mockReturnValue({
      captureMode: 'TAB_CROP',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-1',
      tabId: 7,
    });
    mocks.restoreEffects.mockRejectedValueOnce(new Error('region overlay unavailable'));

    handleTabRecordingNavigationStart(7);
    handleTabRecordingNavigationCommitted(7, 'document-1');
    handleTabRecordingNavigationCompleted(7, 'document-1', vi.fn());
    await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledWith(false));

    expect(isTabRecordingNavigationPending()).toBe(false);
    expect(mocks.abandonEffects).toHaveBeenCalledOnce();
  });

  it('retains fail-closed authority and retries a rejected TAB_CROP stop', async () => {
    mocks.resolveBinding.mockReturnValue({
      captureMode: 'TAB_CROP',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-1',
      tabId: 7,
    });
    mocks.restoreEffects.mockRejectedValueOnce(new Error('region overlay unavailable'));
    mocks.stop
      .mockResolvedValueOnce({ error: 'offscreen unavailable', result: 'failed' })
      .mockResolvedValueOnce({ result: 'accepted' });

    handleTabRecordingNavigationStart(7);
    handleTabRecordingNavigationCommitted(7, 'document-1');
    handleTabRecordingNavigationCompleted(7, 'document-1', vi.fn());

    await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledTimes(2));
    expect(isTabRecordingNavigationPending()).toBe(false);
    expect(mocks.abandonEffects).toHaveBeenCalledOnce();
  });

  it('retries a thrown TAB_CROP stop failure without dropping authority', async () => {
    mocks.resolveBinding.mockReturnValue({
      captureMode: 'TAB_CROP',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-1',
      tabId: 7,
    });
    mocks.restoreEffects.mockRejectedValueOnce(new Error('region overlay unavailable'));
    mocks.stop
      .mockRejectedValueOnce(new Error('lease hydration unavailable'))
      .mockResolvedValueOnce({ result: 'accepted' });

    handleTabRecordingNavigationStart(7);
    handleTabRecordingNavigationCommitted(7, 'document-1');
    handleTabRecordingNavigationCompleted(7, 'document-1', vi.fn());

    await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledTimes(2));
    expect(mocks.abandonEffects).toHaveBeenCalledOnce();
    expect(isTabRecordingNavigationPending()).toBe(false);
  });

  it('does not let a superseding navigation replace a required TAB_CROP stop', async () => {
    mocks.resolveBinding.mockReturnValue({
      captureMode: 'TAB_CROP',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-1',
      tabId: 7,
    });
    mocks.restoreEffects.mockRejectedValueOnce(new Error('region overlay unavailable'));
    let acceptStop!: (result: { result: 'accepted' }) => void;
    mocks.stop.mockResolvedValueOnce({ result: 'already-stopping' }).mockReturnValueOnce(
      new Promise((resolve) => {
        acceptStop = resolve;
      })
    );

    handleTabRecordingNavigationStart(7);
    handleTabRecordingNavigationCommitted(7, 'document-1');
    handleTabRecordingNavigationCompleted(7, 'document-1', vi.fn());
    await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledTimes(2));

    expect(handleTabRecordingNavigationStart(7)).toBe(true);
    expect(handleTabRecordingNavigationCommitted(7, 'document-2')).toBe(true);
    expect(handleTabRecordingNavigationCompleted(7, 'document-2', vi.fn())).toBe(true);
    expect(isTabRecordingNavigationPending()).toBe(true);
    expect(mocks.suspendEffects).toHaveBeenCalledOnce();
    expect(mocks.restoreEffects).toHaveBeenCalledOnce();

    acceptStop({ result: 'accepted' });
    await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));
    expect(mocks.stop).toHaveBeenCalledTimes(2);
    expect(mocks.abandonEffects).toHaveBeenCalledOnce();
  });

  it('routes TAB_CROP startup-recovery rejection through the same bound stop', async () => {
    mocks.resolveBinding.mockReturnValue({
      captureMode: 'TAB_CROP',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-1',
      tabId: 7,
    });
    handleTabRecordingNavigationStart(7);
    mocks.defer.mockImplementationOnce((_work, onFailure) => {
      onFailure?.(new Error('startup recovery failed'));
      return true;
    });

    expect(handleTabRecordingNavigationCommitted(7, 'document-1')).toBe(true);
    await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledWith(false));
    expect(isTabRecordingNavigationPending()).toBe(false);
  });

  it('single-flights concurrent TAB_CROP failures until a terminal stop is acknowledged', async () => {
    mocks.resolveBinding.mockReturnValue({
      captureMode: 'TAB_CROP',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-1',
      tabId: 7,
    });
    let finishFirstStop!: (result: { error: string; result: 'failed' }) => void;
    mocks.stop
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirstStop = resolve;
        })
      )
      .mockResolvedValueOnce({ result: 'accepted' });

    handleTabRecordingNavigationStart(7);
    mocks.defer.mockImplementation((_work, onFailure) => {
      onFailure?.(new Error('startup recovery failed'));
      return true;
    });
    handleTabRecordingNavigationCommitted(7, 'document-1');
    handleTabRecordingNavigationError(7, 'document-1');
    await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
    expect(mocks.abandonEffects).toHaveBeenCalledOnce();
    expect(isTabRecordingNavigationPending()).toBe(true);

    finishFirstStop({ error: 'offscreen unavailable', result: 'failed' });
    await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledTimes(2));
    expect(mocks.abandonEffects).toHaveBeenCalledOnce();
    expect(isTabRecordingNavigationPending()).toBe(false);
  });

  it('ignores debugger detach and window-bound events because no viewport stream exists', () => {
    expect(handleTabRecordingDebuggerDetach(7)).toBe(false);
    expect(handleTabRecordingWindowBoundsChanged(3)).toBe(false);
  });

  it('rejects navigation events when there is no bound native tab recording', () => {
    mocks.resolveBinding.mockReturnValue(null);
    expect(handleTabRecordingNavigationStart(7)).toBe(false);
    expect(handleTabRecordingNavigationCommitted(7, 'document-1')).toBe(false);
    expect(handleTabRecordingNavigationCompleted(7, 'document-1', vi.fn())).toBe(false);
  });

  it('defers every navigation signal behind startup recovery', () => {
    const deferred: Array<() => void> = [];
    mocks.defer.mockImplementation((work?: () => void) => {
      if (work) deferred.push(work);
      return true;
    });

    expect(handleTabRecordingNavigationStart(7)).toBe(true);
    expect(handleTabRecordingNavigationCommitted(7, 'document-1')).toBe(true);
    expect(handleTabRecordingNavigationCompleted(7, 'document-1', vi.fn())).toBe(true);
    expect(handleTabRecordingNavigationError(7, 'document-1', vi.fn())).toBe(true);
    expect(deferred).toHaveLength(4);
    expect(mocks.suspendEffects).not.toHaveBeenCalled();
  });

  it('ignores stale document completion and accepts the matching navigation error signal', async () => {
    handleTabRecordingNavigationStart(7);
    handleTabRecordingNavigationCommitted(7, 'document-1');
    expect(handleTabRecordingNavigationCompleted(7, 'document-2', vi.fn())).toBe(false);
    expect(handleTabRecordingNavigationError(7, 'document-1', vi.fn())).toBe(true);
    await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));
  });

  it('carries manual pause state into restored optional page effects', async () => {
    handleTabRecordingNavigationStart(7);
    markTabRecordingManuallyPaused();
    handleTabRecordingNavigationCommitted(7, 'document-1');
    handleTabRecordingNavigationCompleted(7, 'document-1', vi.fn());
    await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));
    expect(mocks.restoreEffects.mock.calls[0]?.[1]).toMatchObject({ shouldResume: false });
  });

  it('reuses a completed page-effect suspension when superseding a previous document', async () => {
    handleTabRecordingNavigationStart(7);
    await vi.waitFor(() => expect(mocks.suspendEffects).toHaveBeenCalledOnce());
    handleTabRecordingNavigationCommitted(7, 'document-1');
    expect(handleTabRecordingNavigationCommitted(7, 'document-2')).toBe(true);
    handleTabRecordingNavigationCompleted(7, 'document-2', vi.fn());
    await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));
    expect(mocks.suspendEffects).toHaveBeenCalledOnce();
  });
});

describe('tab navigation stale-preparation handoff', () => {
  it('runs a fresh suspension when the superseded preparation was compensated as stale', async () => {
    let finishStalePreparation!: () => void;
    mocks.suspendEffects
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishStalePreparation = resolve;
        })
      )
      .mockResolvedValueOnce(undefined);

    handleTabRecordingNavigationStart(7);
    handleTabRecordingNavigationCommitted(7, 'document-1');
    expect(handleTabRecordingNavigationCommitted(7, 'document-2')).toBe(true);
    handleTabRecordingNavigationCompleted(7, 'document-2', vi.fn());

    finishStalePreparation();
    await vi.waitFor(() => expect(mocks.suspendEffects).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));

    expect(mocks.restoreEffects).toHaveBeenCalledOnce();
    expect(mocks.restoreEffects.mock.calls[0]?.[1]).toMatchObject({ generation: 1, tabId: 7 });
  });

  it('abandons optional effects when completion has no page-access verifier', async () => {
    mocks.restoreEffects.mockImplementationOnce(
      async (_effects, _binding, verify: (tabId: number) => Promise<void>) => verify(7)
    );
    handleTabRecordingNavigationStart(7);
    handleTabRecordingNavigationCommitted(7, 'document-1');
    handleTabRecordingNavigationCompleted(7, 'document-1');
    await vi.waitFor(() => expect(isTabRecordingNavigationPending()).toBe(false));
    expect(mocks.abandonEffects).toHaveBeenCalledOnce();
  });
});
