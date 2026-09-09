import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  release: vi.fn(),
  terminateClosedTab: vi.fn(),
  ensurePage: vi.fn(),
  abandonConflicted: vi.fn(),
}));

vi.mock('../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../page-access/service')>()),
  ensureActivePageAccessRuntime: mocks.ensurePage,
}));

vi.mock('../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface')>()),
  getCaptureSurfaceService: () => ({
    apply: mocks.apply,
    release: mocks.release,
    terminateClosedTab: mocks.terminateClosedTab,
    abandonConflicted: mocks.abandonConflicted,
  }),
}));

import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { CaptureSurfaceError } from '../../capture-surface';
import {
  acceptVideoSourceReady,
  acquireVideoCaptureSurface,
  releaseVideoCaptureSurface,
  waitForVideoSourceReady,
} from './capture-surface';

const applied = {
  generation: 1,
  height: 720,
  leaseId: 'lease-1',
  presetId: 'window-hd',
  sessionId: 'recording-1',
  target: 'window' as const,
  width: 1280,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apply.mockResolvedValue(applied);
  mocks.release.mockResolvedValue(undefined);
  mocks.terminateClosedTab.mockResolvedValue(undefined);
});

describe('window-only video capture surface', () => {
  it('waits for pending alignment before cancelling and releasing its window lease', async () => {
    let finish!: (value: typeof applied) => void;
    mocks.apply.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const acquire = acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB,
      presetId: 'window-hd',
      recordingId: 'cancel-alignment',
      tabId: 7,
    });
    await vi.waitFor(() => expect(mocks.apply).toHaveBeenCalled());
    let released = false;
    const release = releaseVideoCaptureSurface('cancel-alignment').then(() => {
      released = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toBe(false);
    finish(applied);
    await expect(acquire).rejects.toThrow('cancelled');
    await release;
    expect(mocks.release).toHaveBeenCalledWith(applied);
    mocks.release.mockClear();
    await releaseVideoCaptureSurface('cancel-alignment');
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it('preserves a user-resized window instead of forcing restoration after recording', async () => {
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB,
      presetId: 'window-hd',
      recordingId: 'resized',
      tabId: 7,
    });
    mocks.release.mockRejectedValueOnce(new CaptureSurfaceError('restore-conflict'));
    await releaseVideoCaptureSurface('resized');
    expect(mocks.abandonConflicted).toHaveBeenCalledWith(applied);
  });

  it('propagates restoration errors that do not represent a user resize', async () => {
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB,
      presetId: 'window-hd',
      recordingId: 'restore-error',
      tabId: 7,
    });
    mocks.release.mockRejectedValueOnce(new Error('window unavailable'));
    await expect(releaseVideoCaptureSurface('restore-error')).rejects.toThrow('window unavailable');
    await releaseVideoCaptureSurface('restore-error');
  });
  it.each([CaptureMode.SCREEN, CaptureMode.CAMERA])(
    'rejects window presets for %s',
    async (captureMode) => {
      await expect(
        acquireVideoCaptureSurface({
          captureMode,
          presetId: 'window-hd',
          recordingId: 'invalid-mode',
          tabId: 7,
        })
      ).rejects.toThrow('unavailable');
      expect(mocks.apply).not.toHaveBeenCalled();
      await releaseVideoCaptureSurface('invalid-mode');
    }
  );
  it('does not mutate the preset when page measurement access is unavailable', async () => {
    mocks.ensurePage.mockRejectedValueOnce(new Error('page access unavailable'));
    await expect(
      acquireVideoCaptureSurface({
        captureMode: CaptureMode.TAB,
        presetId: 'window-hd',
        recordingId: 'no-access',
        tabId: 7,
      })
    ).rejects.toThrow('page access unavailable');
    expect(mocks.apply).not.toHaveBeenCalled();
    await releaseVideoCaptureSurface('no-access');
  });
  it('aligns a tab-crop preset before crop selection', async () => {
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB_CROP,
      presetId: 'window-hd',
      recordingId: 'crop',
      tabId: 7,
    });
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'video-tab-crop',
        measureVideoViewport: expect.any(Function),
      })
    );
    await releaseVideoCaptureSurface('crop');
    await releaseVideoCaptureSurface(null);
  });
  it('does not prepare or align an ordinary tab recording without a preset', async () => {
    await expect(
      acquireVideoCaptureSurface({
        captureMode: CaptureMode.TAB,
        presetId: null,
        recordingId: 'ordinary-tab',
        tabId: 7,
      })
    ).resolves.toBeNull();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.ensurePage).not.toHaveBeenCalled();
    await releaseVideoCaptureSurface('ordinary-tab');
  });
  it('applies and releases the selected browser-window preset', async () => {
    await expect(
      acquireVideoCaptureSurface({
        captureMode: CaptureMode.TAB,
        presetId: applied.presetId,
        recordingId: applied.sessionId,
        tabId: 7,
      })
    ).resolves.toEqual(applied);
    expect(mocks.apply).toHaveBeenCalledWith({
      context: 'video-tab',
      measureVideoViewport: expect.any(Function),
      generation: 1,
      owner: 'video',
      presetId: applied.presetId,
      sessionId: applied.sessionId,
      tabId: 7,
    });
    await releaseVideoCaptureSurface(applied.sessionId);
    expect(mocks.release).toHaveBeenCalledWith(applied);
  });

  it('admits a native source from positive metadata without viewport heuristics', async () => {
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB,
      presetId: applied.presetId,
      recordingId: applied.sessionId,
      tabId: 7,
    });
    const ready = waitForVideoSourceReady({
      expectedStreamInstanceId: 'stream-1',
      recordingId: applied.sessionId,
    });
    await expect(
      acceptVideoSourceReady({
        generation: 1,
        recordingId: applied.sessionId,
        streamInstanceId: 'stream-1',
        trackSettings: { height: 720, width: 1280 },
        type: 'OFFSCREEN_SOURCE_READY',
        videoHeight: 720,
        videoWidth: 1280,
      })
    ).resolves.toBe('ALLOW');
    await expect(ready).resolves.toBe('stream-1');
  });

  it('rejects malformed source metadata deterministically', async () => {
    await acquireVideoCaptureSurface({
      captureMode: CaptureMode.TAB,
      presetId: applied.presetId,
      recordingId: applied.sessionId,
      tabId: 7,
    });
    const ready = waitForVideoSourceReady({
      expectedStreamInstanceId: 'stream-1',
      recordingId: applied.sessionId,
    });
    await expect(
      acceptVideoSourceReady({
        generation: 1,
        recordingId: applied.sessionId,
        streamInstanceId: 'stream-1',
        trackSettings: {},
        type: 'OFFSCREEN_SOURCE_READY',
        videoHeight: 0,
        videoWidth: 1280,
      })
    ).resolves.toBe('DENY');
    await expect(ready).rejects.toThrow('invalid dimensions');
  });
});
