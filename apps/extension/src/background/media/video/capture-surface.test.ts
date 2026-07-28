import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  clearActiveLease: vi.fn(),
  getAppliedForSession: vi.fn(),
  recoverCaptureSurfaces: vi.fn(),
  readTabCaptureViewport: vi.fn(),
  release: vi.fn(),
  reassert: vi.fn(),
  terminateClosedTab: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  ensureActiveLeaseHydrated: vi.fn(),
}));

vi.mock('../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface')>()),
  getCaptureSurfaceService: () => ({
    apply: mocks.apply,
    getAppliedForSession: mocks.getAppliedForSession,
    release: mocks.release,
    reassert: mocks.reassert,
    terminateClosedTab: mocks.terminateClosedTab,
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

vi.mock('../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../routing-contracts/runtime-messaging/services')>()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.sendRuntimeMessage }),
}));

import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  acceptVideoSourceReady,
  acquireVideoCaptureSurface,
  getVideoSurfaceSession,
  markVideoCaptureSurfaceTabClosed,
  recoverVideoCaptureSurfaceOnStartup,
  releaseVideoCaptureSurface,
  waitForVideoCaptureSurfaceRecovery,
  waitForVideoSourceReady,
} from './capture-surface';

function appliedSurface(target: 'viewport' | 'window' = 'viewport') {
  return {
    sessionId: 'recording-1',
    leaseId: 'lease-1',
    generation: 1,
    presetId: 'preset-1',
    target,
    width: 1280,
    height: 720,
  };
}

function readyMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: 'OFFSCREEN_SOURCE_READY' as const,
    recordingId: 'recording-1',
    generation: 1,
    streamInstanceId: 'stream-instance-1',
    videoWidth: 1280,
    videoHeight: 720,
    trackSettings: { width: 1280, height: 720 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  mocks.apply.mockResolvedValue(appliedSurface());
  mocks.clearActiveLease.mockResolvedValue(undefined);
  mocks.release.mockResolvedValue(undefined);
  mocks.reassert.mockResolvedValue(undefined);
  mocks.recoverCaptureSurfaces.mockResolvedValue(undefined);
  mocks.readTabCaptureViewport.mockResolvedValue({
    devicePixelRatio: 2,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    visualViewportScale: 1,
    width: 1280,
  });
  mocks.sendRuntimeMessage.mockImplementation(async (message: { type: string }) =>
    message.type === 'OFFSCREEN_REVALIDATE_SOURCE'
      ? { success: true, result: 'ALLOW', videoWidth: 1280, videoHeight: 720 }
      : { success: true }
  );
  mocks.terminateClosedTab.mockResolvedValue(undefined);
  mocks.ensureActiveLeaseHydrated.mockResolvedValue(null);
});

describe('video capture-surface source validation', () => {
  it('resolves the selected preset only when recording starts', async () => {
    await expect(
      acquireVideoCaptureSurface({
        captureMode: CaptureMode.TAB,
        presetId: 'preset-1',
        recordingId: 'recording-1',
        tabId: 7,
      })
    ).resolves.toEqual(appliedSurface());

    expect(mocks.apply).toHaveBeenCalledWith({
      sessionId: 'recording-1',
      generation: 1,
      owner: 'video',
      tabId: 7,
      presetId: 'preset-1',
      context: 'video-tab',
    });
    await releaseVideoCaptureSurface('recording-1');
  });

  it('allows a natural viewport source and rejects invalid metadata immediately', async () => {
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB,
      presetId: 'preset-1',
      recordingId: 'recording-1',
      tabId: 7,
    });
    const ready = waitForVideoSourceReady({
      recordingId: 'recording-1',
      expectedStreamInstanceId: 'stream-instance-1',
      expectedViewport: null,
      tabId: 7,
    });

    expect(
      await acceptVideoSourceReady(
        readyMessage({
          videoWidth: 1280,
          videoHeight: 720,
          trackSettings: { width: 1280, height: 720 },
        })
      )
    ).toBe('ALLOW');
    await expect(ready).resolves.toBe('stream-instance-1');
    await releaseVideoCaptureSurface('recording-1');

    mocks.apply.mockResolvedValue({ ...appliedSurface(), sessionId: 'recording-2' });
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB_CROP,
      presetId: 'preset-1',
      recordingId: 'recording-2',
      tabId: 7,
    });
    const mismatch = waitForVideoSourceReady({
      recordingId: 'recording-2',
      expectedStreamInstanceId: 'stream-instance-1',
      expectedViewport: null,
      tabId: 7,
    });
    expect(
      await acceptVideoSourceReady(
        readyMessage({
          recordingId: 'recording-2',
          videoWidth: 0,
        })
      )
    ).toBe('DENY');
    const mismatchExpectation = expect(mismatch).rejects.toThrow('source-dimensions-mismatch');
    await mismatchExpectation;
    await releaseVideoCaptureSurface('recording-2');
  });

  it('accepts current-size source metadata without imposing viewport equality', async () => {
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB,
      presetId: null,
      recordingId: 'recording-1',
      tabId: 7,
    });
    const ready = waitForVideoSourceReady({
      recordingId: 'recording-1',
      expectedStreamInstanceId: 'stream-instance-1',
      expectedViewport: null,
      tabId: 7,
    });

    expect(
      await acceptVideoSourceReady(
        readyMessage({
          videoWidth: 2560,
          videoHeight: 1440,
          trackSettings: { width: 1425, height: 740 },
        })
      )
    ).toBe('ALLOW');
    await expect(ready).resolves.toBe('stream-instance-1');
    await releaseVideoCaptureSurface('recording-1');
  });

  it('denies source activation when the live viewport changed after selection', async () => {
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB_CROP,
      presetId: null,
      recordingId: 'recording-live-mismatch',
      tabId: 7,
    });
    const expectedViewport = {
      devicePixelRatio: 2,
      height: 720,
      scrollX: 0,
      scrollY: 0,
      visualViewportScale: 1,
      width: 1280,
    };
    const ready = waitForVideoSourceReady({
      recordingId: 'recording-live-mismatch',
      expectedStreamInstanceId: 'stream-instance-1',
      expectedViewport,
      tabId: 7,
    });
    mocks.readTabCaptureViewport.mockResolvedValueOnce({
      ...expectedViewport,
      height: 768,
      width: 1024,
    });

    expect(
      await acceptVideoSourceReady(readyMessage({ recordingId: 'recording-live-mismatch' }))
    ).toBe('DENY');
    await expect(ready).rejects.toThrow('viewport changed while the recording source was opening');
    await releaseVideoCaptureSurface('recording-live-mismatch');
  });

  it('accepts the natural raw source for a window target without comparing outer bounds', async () => {
    mocks.apply.mockResolvedValue(appliedSurface('window'));
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB,
      presetId: 'preset-1',
      recordingId: 'recording-1',
      tabId: 7,
    });
    const ready = waitForVideoSourceReady({
      recordingId: 'recording-1',
      expectedStreamInstanceId: 'stream-instance-1',
      expectedViewport: null,
      tabId: 7,
    });

    expect(
      await acceptVideoSourceReady(
        readyMessage({
          videoWidth: 1137,
          videoHeight: 641,
          trackSettings: { width: 1280, height: 720 },
        })
      )
    ).toBe('ALLOW');
    await expect(ready).resolves.toBe('stream-instance-1');
    await releaseVideoCaptureSurface('recording-1');
  });
});

describe('video capture-surface session termination', () => {
  it('times out fail-closed when offscreen never reports a matching source', async () => {
    vi.useFakeTimers();
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB,
      presetId: 'preset-1',
      recordingId: 'recording-1',
      tabId: 7,
    });
    const ready = waitForVideoSourceReady({
      recordingId: 'recording-1',
      expectedStreamInstanceId: 'stream-instance-1',
      expectedViewport: null,
      tabId: 7,
    });
    const timeoutExpectation = expect(ready).rejects.toThrow(
      'Timed out while validating the recording source'
    );

    await vi.advanceTimersByTimeAsync(10_000);
    await timeoutExpectation;
    await releaseVideoCaptureSurface('recording-1');
    vi.useRealTimers();
  });

  it('keeps screen and camera presets inert', async () => {
    await expect(
      acquireVideoCaptureSurface({
        captureMode: CaptureMode.SCREEN,
        presetId: 'preset-1',
        recordingId: 'recording-screen',
        tabId: 7,
      })
    ).rejects.toThrow('unavailable for screen recording');
    await expect(
      acquireVideoCaptureSurface({
        captureMode: CaptureMode.CAMERA,
        presetId: 'preset-1',
        recordingId: 'recording-camera',
        tabId: null,
      })
    ).rejects.toThrow('unavailable for camera recording');
    expect(mocks.apply).not.toHaveBeenCalled();
    await releaseVideoCaptureSurface('recording-screen');
    await releaseVideoCaptureSurface('recording-camera');
  });

  it('deduplicates concurrent terminal release and retains one restoration owner', async () => {
    let resolveRelease!: () => void;
    mocks.release.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRelease = resolve;
      })
    );
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB,
      presetId: 'preset-1',
      recordingId: 'recording-race',
      tabId: 7,
    });

    const first = releaseVideoCaptureSurface('recording-race');
    const second = releaseVideoCaptureSurface('recording-race');
    expect(mocks.release).toHaveBeenCalledOnce();
    resolveRelease();
    await Promise.all([first, second]);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('terminates a closed viewport tab without ordinary restoration', async () => {
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB,
      presetId: 'preset-1',
      recordingId: 'recording-closed',
      tabId: 7,
    });
    mocks.release.mockClear();
    markVideoCaptureSurfaceTabClosed('recording-closed', 7);

    await releaseVideoCaptureSurface('recording-closed');

    expect(mocks.terminateClosedTab).toHaveBeenCalledWith(7, ['video']);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('does not claim an unrelated screenshot surface when closed-tab recording used current size', async () => {
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB,
      presetId: null,
      recordingId: 'recording-native-closed',
      tabId: 7,
    });
    mocks.terminateClosedTab.mockClear();
    markVideoCaptureSurfaceTabClosed('recording-native-closed', 7);

    await releaseVideoCaptureSurface('recording-native-closed');

    expect(mocks.terminateClosedTab).not.toHaveBeenCalled();
  });
});

describe('video capture-surface recovery', () => {
  it('recovers a live persisted surface session after worker restart', async () => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
      recordingId: 'recording-live',
      recordingTabId: 9,
      phase: 'active',
      surfaceBinding: { generation: 4, streamInstanceId: 'stream-live' },
      viewportPresetId: 'preset-1',
    });
    mocks.getAppliedForSession.mockReturnValueOnce({
      ...appliedSurface(),
      generation: 4,
      sessionId: 'recording-live',
    });

    await recoverVideoCaptureSurfaceOnStartup();

    const liveSessionIds = mocks.recoverCaptureSurfaces.mock.calls[0]?.[0];
    await expect(liveSessionIds).resolves.toEqual(new Set(['recording-live']));
    expect(getVideoSurfaceSession('recording-live')).toMatchObject({
      generation: 4,
      recordingId: 'recording-live',
      streamInstanceId: 'stream-live',
      tabId: 9,
    });
    expect(mocks.reassert).toHaveBeenCalledWith({
      generation: 4,
      leaseId: 'lease-1',
      sessionId: 'recording-live',
    });
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        generation: 4,
        recordingId: 'recording-live',
        streamInstanceId: 'stream-live',
        type: 'OFFSCREEN_REVALIDATE_SOURCE',
      })
    );
  });

  it('does not issue an unbound global stop when no persisted recording is live', async () => {
    await recoverVideoCaptureSurfaceOnStartup();

    const abandonedSessionIds = mocks.recoverCaptureSurfaces.mock.calls[0]?.[0];
    await expect(abandonedSessionIds).resolves.toEqual(new Set());
    expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();

    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
      recordingId: 'recording-without-surface',
      recordingTabId: 9,
      phase: 'active',
      surfaceBinding: null,
      viewportPresetId: null,
    });
    mocks.getAppliedForSession.mockReturnValueOnce(null);
    await recoverVideoCaptureSurfaceOnStartup();
    expect(getVideoSurfaceSession('recording-without-surface')).toBeNull();
  });

  it('rehydrates and revalidates a bound current-size recording without a surface lease', async () => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
      recordingId: 'recording-current-size',
      recordingTabId: 9,
      phase: 'active',
      surfaceBinding: { generation: 4, streamInstanceId: 'stream-current-size' },
      viewportPresetId: null,
    });
    mocks.getAppliedForSession.mockReturnValueOnce(null);

    await recoverVideoCaptureSurfaceOnStartup();

    expect(getVideoSurfaceSession('recording-current-size')).toMatchObject({
      applied: null,
      generation: 4,
      recordingId: 'recording-current-size',
      streamInstanceId: 'stream-current-size',
      tabId: 9,
    });
    expect(mocks.reassert).not.toHaveBeenCalled();
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        generation: 4,
        recordingId: 'recording-current-size',
        streamInstanceId: 'stream-current-size',
        type: 'OFFSCREEN_REVALIDATE_SOURCE',
      })
    );
  });

  it('fails a crash-window prepared recording closed instead of hydrating it as live', async () => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
      phase: 'prepared',
      recordingId: 'recording-prepared',
      recordingTabId: 9,
      surfaceBinding: { generation: 1, streamInstanceId: 'stream-prepared' },
      viewportPresetId: 'preset-1',
    });
    const preparedSurface = {
      ...appliedSurface(),
      sessionId: 'recording-prepared',
    };
    mocks.getAppliedForSession.mockReturnValueOnce(preparedSurface);

    await recoverVideoCaptureSurfaceOnStartup();

    const liveSessionIds = mocks.recoverCaptureSurfaces.mock.calls[0]?.[0];
    await expect(liveSessionIds).resolves.toEqual(new Set(['recording-prepared']));
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ discard: true, type: 'OFFSCREEN_STOP_RECORDING' })
    );
    expect(mocks.sendRuntimeMessage.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.release.mock.invocationCallOrder[0]!
    );
    expect(mocks.release).toHaveBeenCalledWith(preparedSurface);
    expect(mocks.clearActiveLease).toHaveBeenCalledWith('recording-prepared');
    expect(getVideoSurfaceSession('recording-prepared')).toBeNull();
  });

  it('retains a prepared surface and lease when crash recovery cannot acknowledge STOP', async () => {
    const preparedLease = {
      phase: 'prepared',
      recordingId: 'recording-prepared',
      recordingTabId: 9,
      surfaceBinding: { generation: 1, streamInstanceId: 'stream-prepared' },
      viewportPresetId: 'preset-1',
    } as const;
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(preparedLease);
    mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: false, error: 'offscreen missing' });

    await expect(recoverVideoCaptureSurfaceOnStartup()).rejects.toThrow('offscreen missing');
    await expect(waitForVideoCaptureSurfaceRecovery()).rejects.toThrow('offscreen missing');

    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.clearActiveLease).not.toHaveBeenCalled();

    const preparedSurface = { ...appliedSurface(), sessionId: 'recording-prepared' };
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce(preparedLease);
    mocks.getAppliedForSession.mockReturnValueOnce(preparedSurface);
    mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: true });
    await recoverVideoCaptureSurfaceOnStartup();
    await expect(waitForVideoCaptureSurfaceRecovery()).resolves.toBeUndefined();
    expect(mocks.release).toHaveBeenCalledWith(preparedSurface);
    expect(mocks.clearActiveLease).toHaveBeenCalledWith('recording-prepared');
  });

  it('retains a prepared preset surface when its durable source binding is incomplete', async () => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
      phase: 'prepared',
      recordingId: 'recording-incomplete',
      recordingTabId: 9,
      surfaceBinding: null,
      viewportPresetId: 'preset-1',
    });

    await expect(recoverVideoCaptureSurfaceOnStartup()).rejects.toThrow(
      'Recovered prepared recording source binding is incomplete'
    );

    const liveSessionIds = mocks.recoverCaptureSurfaces.mock.calls[0]?.[0];
    await expect(liveSessionIds).resolves.toEqual(new Set(['recording-incomplete']));
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.clearActiveLease).not.toHaveBeenCalled();
  });

  it('installs the authoritative recovery barrier before delayed lease hydration settles', async () => {
    let resolveLease!: (value: {
      recordingId: string;
      recordingTabId: number;
      phase: 'active';
      surfaceBinding: { generation: number; streamInstanceId: string };
      viewportPresetId: string;
    }) => void;
    const delayedLease = new Promise<{
      recordingId: string;
      recordingTabId: number;
      phase: 'active';
      surfaceBinding: { generation: number; streamInstanceId: string };
      viewportPresetId: string;
    }>((resolve) => {
      resolveLease = resolve;
    });
    mocks.ensureActiveLeaseHydrated.mockReturnValueOnce(delayedLease);
    mocks.recoverCaptureSurfaces.mockImplementationOnce(async (liveSessionIds) => {
      await liveSessionIds;
    });
    mocks.getAppliedForSession.mockReturnValueOnce({
      ...appliedSurface(),
      generation: 4,
      sessionId: 'recording-live',
    });

    const recovery = recoverVideoCaptureSurfaceOnStartup();
    expect(mocks.recoverCaptureSurfaces).toHaveBeenCalledOnce();
    expect(mocks.getAppliedForSession).not.toHaveBeenCalled();

    resolveLease({
      recordingId: 'recording-live',
      recordingTabId: 9,
      phase: 'active',
      surfaceBinding: { generation: 4, streamInstanceId: 'stream-live' },
      viewportPresetId: 'preset-1',
    });
    await recovery;

    const liveSessionIds = mocks.recoverCaptureSurfaces.mock.calls[0]?.[0];
    await expect(liveSessionIds).resolves.toEqual(new Set(['recording-live']));
    expect(getVideoSurfaceSession('recording-live')).toMatchObject({
      recordingId: 'recording-live',
      tabId: 9,
    });
  });
});

describe('video capture-surface invalid recovery', () => {
  it('retains an unbound recovered preset recording instead of mutating another source', async () => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
      recordingId: 'recording-unbound',
      recordingTabId: 9,
      phase: 'active',
      surfaceBinding: null,
      viewportPresetId: 'preset-1',
    });

    await expect(recoverVideoCaptureSurfaceOnStartup()).rejects.toThrow(
      'Recovered recording source binding is incomplete'
    );

    const liveSessionIds = mocks.recoverCaptureSurfaces.mock.calls[0]?.[0];
    await expect(liveSessionIds).resolves.toEqual(new Set(['recording-unbound']));
    expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
    expect(mocks.clearActiveLease).not.toHaveBeenCalledWith('recording-unbound');
    expect(getVideoSurfaceSession('recording-unbound')).toBeNull();
  });

  it('fails conflicted or generation-mismatched recovered surfaces closed', async () => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
      recordingId: 'recording-conflict',
      recordingTabId: 9,
      phase: 'active',
      surfaceBinding: { generation: 4, streamInstanceId: 'stream-live' },
      viewportPresetId: 'preset-1',
    });
    mocks.getAppliedForSession.mockReturnValueOnce(null);
    await recoverVideoCaptureSurfaceOnStartup();
    expect(mocks.clearActiveLease).toHaveBeenCalledWith('recording-conflict');

    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
      recordingId: 'recording-mismatch',
      recordingTabId: 9,
      phase: 'active',
      surfaceBinding: { generation: 5, streamInstanceId: 'stream-live' },
      viewportPresetId: 'preset-1',
    });
    mocks.getAppliedForSession.mockReturnValueOnce({
      ...appliedSurface(),
      generation: 4,
      sessionId: 'recording-mismatch',
    });
    await recoverVideoCaptureSurfaceOnStartup();
    expect(mocks.clearActiveLease).toHaveBeenCalledWith('recording-mismatch');
    expect(getVideoSurfaceSession('recording-mismatch')).toBeNull();
  });

  it('fails a recovered viewport recording closed when offscreen rejects its stored mapping', async () => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
      recordingId: 'recording-invalid-raw',
      recordingTabId: 9,
      phase: 'active',
      surfaceBinding: { generation: 4, streamInstanceId: 'stream-live' },
      viewportPresetId: 'preset-1',
    });
    mocks.getAppliedForSession.mockReturnValue({
      ...appliedSurface(),
      generation: 4,
      sessionId: 'recording-invalid-raw',
    });
    mocks.sendRuntimeMessage.mockImplementation(async (message: { type: string }) =>
      message.type === 'OFFSCREEN_REVALIDATE_SOURCE'
        ? {
            success: false,
            result: 'DENY',
            error: 'Recording tab output mapping changed during revalidation',
          }
        : { success: true }
    );

    await recoverVideoCaptureSurfaceOnStartup();

    expect(mocks.release).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'recording-invalid-raw' })
    );
    expect(mocks.clearActiveLease).toHaveBeenCalledWith('recording-invalid-raw');
    expect(getVideoSurfaceSession('recording-invalid-raw')).toBeNull();
  });

  it.each([
    ['rejected transport', () => Promise.reject(new Error('offscreen unavailable'))],
    ['explicit denial', () => Promise.resolve({ success: false, error: 'stop denied' })],
  ])('retains recovery authority when recovered stop has %s', async (_label, stopResponse) => {
    mocks.ensureActiveLeaseHydrated.mockResolvedValueOnce({
      recordingId: 'recording-stop-failed',
      recordingTabId: 9,
      phase: 'active',
      surfaceBinding: { generation: 4, streamInstanceId: 'stream-live' },
      viewportPresetId: 'preset-1',
    });
    mocks.getAppliedForSession.mockReturnValue({
      ...appliedSurface(),
      generation: 4,
      sessionId: 'recording-stop-failed',
    });
    mocks.reassert.mockRejectedValueOnce(new Error('physical mismatch'));
    mocks.sendRuntimeMessage.mockImplementation(async (message: { type: string }) => {
      if (message.type === 'OFFSCREEN_STOP_RECORDING') return stopResponse();
      return { success: true };
    });

    await expect(recoverVideoCaptureSurfaceOnStartup()).rejects.toThrow();

    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.clearActiveLease).not.toHaveBeenCalled();
    expect(getVideoSurfaceSession('recording-stop-failed')).not.toBeNull();
  });
});
