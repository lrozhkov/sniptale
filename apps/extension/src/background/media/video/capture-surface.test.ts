import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  release: vi.fn(),
  terminateClosedTab: vi.fn(),
}));

vi.mock('../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface')>()),
  getCaptureSurfaceService: () => ({
    apply: mocks.apply,
    release: mocks.release,
    terminateClosedTab: mocks.terminateClosedTab,
  }),
}));

import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
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
