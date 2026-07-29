// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSourceVideo: vi.fn(),
  releaseSourceVideo: vi.fn(),
  waitForSourceMetadata: vi.fn(),
}));

vi.mock('./video-source', () => ({
  createSourceVideo: mocks.createSourceVideo,
  releaseSourceVideo: mocks.releaseSourceVideo,
  waitForSourceMetadata: mocks.waitForSourceMetadata,
}));

import { createGatedCropStream } from './crop-stream';
import { createStream, createTrackedStream } from '../multi-source/media-stream.test-support';

type NavigationHarness = {
  canvas: HTMLCanvasElement;
  context: { drawImage: ReturnType<typeof vi.fn> };
  requestVideoFrameCallback: ReturnType<typeof vi.fn>;
  video: {
    cancelVideoFrameCallback: ReturnType<typeof vi.fn>;
    requestVideoFrameCallback: ReturnType<typeof vi.fn>;
    videoHeight: number;
    videoWidth: number;
  };
};

function installNavigationHarness(): NavigationHarness {
  const output = createTrackedStream();
  const context = { drawImage: vi.fn() };
  const canvases: HTMLCanvasElement[] = [];
  Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
    configurable: true,
    value: vi.fn(function (this: HTMLCanvasElement) {
      canvases.push(this);
      return output;
    }),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => context),
  });
  const requestVideoFrameCallback = vi.fn(() => 1);
  const video = {
    cancelVideoFrameCallback: vi.fn(),
    requestVideoFrameCallback,
    videoHeight: 720,
    videoWidth: 1280,
  };
  mocks.createSourceVideo.mockReturnValue(video);
  return {
    get canvas() {
      const canvas = canvases[0];
      if (!canvas) throw new Error('Navigation output canvas is unavailable');
      return canvas;
    },
    context,
    requestVideoFrameCallback,
    video,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.waitForSourceMetadata.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('crop stream navigation output', () => {
  it('keeps drawing live frames when video-frame callbacks are available but starved', async () => {
    const harness = installNavigationHarness();
    const gated = await createGatedCropStream(createStream(1280, 720), {
      sourceRect: { x: 0, y: 0, width: 1280, height: 720 },
      outputSize: { width: 1280, height: 720 },
    });

    expect(harness.context.drawImage).toHaveBeenCalledOnce();
    expect(harness.requestVideoFrameCallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);

    expect(harness.context.drawImage.mock.calls.length).toBeGreaterThan(1);
    expect(harness.context.drawImage.mock.calls.every(([source]) => source === harness.video)).toBe(
      true
    );
    const callsBeforeStop = harness.context.drawImage.mock.calls.length;
    gated.stream.getVideoTracks()[0]?.stop();
    await vi.advanceTimersByTimeAsync(100);
    expect(harness.context.drawImage).toHaveBeenCalledTimes(callsBeforeStop);
  });

  it('activates a suspended viewport immediately without coupling rendering to source callbacks', async () => {
    const harness = installNavigationHarness();
    const gated = await createGatedCropStream(
      createStream(1280, 720),
      {
        sourceRect: { x: 0, y: 0, width: 1280, height: 720 },
        outputSize: { width: 1280, height: 720 },
      },
      { initiallySuspended: true }
    );

    gated.controls.activate();

    expect(harness.context.drawImage).toHaveBeenCalledOnce();
    expect(harness.requestVideoFrameCallback).not.toHaveBeenCalled();
    gated.stream.getVideoTracks()[0]?.stop();
  });

  it('keeps freezes tokenized and retries a failed thaw deterministically', async () => {
    const harness = installNavigationHarness();
    const gated = await createGatedCropStream(
      createStream(1280, 720),
      {
        sourceRect: { x: 0, y: 0, width: 1280, height: 720 },
        outputSize: { width: 1280, height: 720 },
      },
      { initiallySuspended: true }
    );

    expect(harness.context.drawImage).not.toHaveBeenCalled();
    expect(gated.controls.setFrozen('navigation-1', true)).toBe('applied');
    gated.controls.activate();
    expect(gated.controls.setFrozen('navigation-2', true)).toBe('applied');
    expect(gated.controls.setFrozen('navigation-1', false)).toBe('stale');
    await vi.advanceTimersByTimeAsync(100);
    expect(harness.context.drawImage.mock.calls).not.toHaveLength(0);
    expect(
      harness.context.drawImage.mock.calls.every(([source]) => source === harness.canvas)
    ).toBe(true);

    expect(gated.controls.readFrozenSourceSize('navigation-2')).toEqual({
      height: 720,
      width: 1280,
    });
    expect(
      gated.controls.applyFrozenSourceGeometry('navigation-2', {
        sourceRect: { x: 0, y: 0, width: 1280, height: 720 },
        outputSize: { width: 1280, height: 720 },
      })
    ).toBe('applied');
    const heldFrameCount = harness.context.drawImage.mock.calls.length;
    expect(gated.controls.setFrozen('navigation-2', false)).toBe('applied');
    expect(harness.context.drawImage.mock.calls).toHaveLength(heldFrameCount + 1);
    expect(harness.context.drawImage.mock.calls.at(-1)?.[0]).toBe(harness.video);
    expect(gated.controls.setFrozen('navigation-2', false)).toBe('applied');
    expect(gated.controls.setFrozen('navigation-2', true)).toBe('stale');

    expect(gated.controls.setFrozen('navigation-3', true)).toBe('applied');
    expect(gated.controls.readFrozenSourceSize('navigation-3')).toEqual({
      height: 720,
      width: 1280,
    });
    expect(
      gated.controls.applyFrozenSourceGeometry('navigation-3', {
        sourceRect: { x: 0, y: 0, width: 1280, height: 720 },
        outputSize: { width: 1280, height: 720 },
      })
    ).toBe('applied');
    harness.context.drawImage.mockImplementationOnce(() => {
      throw new Error('fresh draw failed');
    });
    expect(() => gated.controls.setFrozen('navigation-3', false)).toThrow('fresh draw failed');
    const callsAfterFailedThaw = harness.context.drawImage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100);
    expect(harness.context.drawImage.mock.calls.length).toBeGreaterThan(callsAfterFailedThaw);
    expect(
      harness.context.drawImage.mock.calls
        .slice(callsAfterFailedThaw)
        .every(([source]) => source === harness.canvas)
    ).toBe(true);
    expect(gated.controls.setFrozen('navigation-3', false)).toBe('applied');
    expect(harness.context.drawImage.mock.calls.at(-1)?.[0]).toBe(harness.video);

    gated.stream.getVideoTracks()[0]?.stop();
    expect(gated.controls.setFrozen('navigation-4', true)).toBe('stale');
  });

  it('keeps the encoded timeline alive with held frames across repeated freezes', async () => {
    const harness = installNavigationHarness();
    const gated = await createGatedCropStream(createStream(1280, 720), {
      sourceRect: { x: 0, y: 0, width: 1280, height: 720 },
      outputSize: { width: 1280, height: 720 },
    });
    expect(harness.context.drawImage).toHaveBeenCalledOnce();

    expect(gated.controls.setFrozen('navigation-1', true)).toBe('applied');
    await vi.advanceTimersByTimeAsync(100);
    expect(harness.context.drawImage.mock.calls.slice(1)).not.toHaveLength(0);
    expect(
      harness.context.drawImage.mock.calls.slice(1).every(([source]) => source === harness.canvas)
    ).toBe(true);

    expect(gated.controls.readFrozenSourceSize('navigation-1')).toEqual({
      height: 720,
      width: 1280,
    });
    expect(
      gated.controls.applyFrozenSourceGeometry('navigation-1', {
        sourceRect: { x: 0, y: 0, width: 1280, height: 720 },
        outputSize: { width: 1280, height: 720 },
      })
    ).toBe('applied');
    expect(gated.controls.setFrozen('navigation-1', false)).toBe('applied');
    expect(harness.context.drawImage.mock.calls.at(-1)?.[0]).toBe(harness.video);
    expect(harness.requestVideoFrameCallback).not.toHaveBeenCalled();
    const callsAfterThaw = harness.context.drawImage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100);
    expect(harness.context.drawImage.mock.calls.length).toBeGreaterThan(callsAfterThaw);
    expect(
      harness.context.drawImage.mock.calls
        .slice(callsAfterThaw)
        .every(([source]) => source === harness.video)
    ).toBe(true);

    expect(gated.controls.setFrozen('navigation-2', true)).toBe('applied');
    const callsBeforeSecondFreeze = harness.context.drawImage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100);
    expect(harness.context.drawImage.mock.calls.length).toBeGreaterThan(callsBeforeSecondFreeze);
    expect(
      harness.context.drawImage.mock.calls
        .slice(callsBeforeSecondFreeze)
        .every(([source]) => source === harness.canvas)
    ).toBe(true);

    gated.stream.getVideoTracks()[0]?.stop();
  });

  it('keeps a viewport crop frozen until current source geometry is applied', async () => {
    const harness = installNavigationHarness();
    const gated = await createGatedCropStream(
      createStream(1280, 720),
      {
        sourceRect: { x: 100, y: 80, width: 300, height: 300 },
        outputSize: { width: 300, height: 300 },
      },
      { initiallySuspended: true }
    );
    gated.controls.activate();
    expect(gated.controls.setFrozen('navigation-1', true)).toBe('applied');

    expect(() =>
      gated.controls.applyFrozenSourceGeometry('navigation-1', {
        sourceRect: { x: 150, y: 120, width: 450, height: 450 },
        outputSize: { width: 300, height: 300 },
      })
    ).toThrow('reading the frozen source');
    expect(() => gated.controls.setFrozen('navigation-1', false)).toThrow('frozen source geometry');
    await vi.advanceTimersByTimeAsync(100);
    expect(
      harness.context.drawImage.mock.calls.slice(1).every(([source]) => source === harness.canvas)
    ).toBe(true);

    harness.video.videoWidth = 1920;
    harness.video.videoHeight = 1080;
    expect(gated.controls.readFrozenSourceSize('navigation-1')).toEqual({
      height: 1080,
      width: 1920,
    });
    expect(
      gated.controls.applyFrozenSourceGeometry('navigation-1', {
        sourceRect: { x: 150, y: 120, width: 450, height: 450 },
        outputSize: { width: 300, height: 300 },
      })
    ).toBe('applied');
    expect(gated.controls.setFrozen('navigation-1', false)).toBe('applied');
    expect(harness.context.drawImage).toHaveBeenLastCalledWith(
      harness.video,
      150,
      120,
      450,
      450,
      0,
      0,
      300,
      300
    );
  });
});
