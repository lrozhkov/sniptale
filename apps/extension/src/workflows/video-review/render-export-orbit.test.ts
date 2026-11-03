import { expect, it, vi } from 'vitest';
import * as spatialSession from './spatial-render-session';
import { contextFixture } from './render-export.test-support';
import { renderRenderWindowFrames } from './render-export';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';

it('prepares spatial export for a newly created cursor Orbit without authored manual perspective', async () => {
  const draw = vi.fn(),
    dispose = vi.fn();
  const open = vi.spyOn(spatialSession, 'createReviewSpatialSession').mockImplementation(() => ({
    resourceCounters: { managedBytes: 0, peakManagedBytes: 0, canvasCount: 0, peakCanvasCount: 0 },
    validateSizes: vi.fn(),
    draw,
    dispose,
    surface: (_kind, width, height) => ({
      canvas: { width, height } as HTMLCanvasElement,
      context: contextFixture(),
    }),
  }));
  const region = createQuickEditZoomRegion({ id: 'new-cursor-export', at: 0, duration: 2 });
  region.cursorFocus = {
    path: {
      version: 1,
      mode: 'follow',
      smoothing: 0.5,
      sensitivity: 0.5,
      gapPolicy: 'hold',
      segments: [],
    },
  };
  const videoOut = { add: vi.fn(async () => undefined), close: vi.fn() };
  const frameSink = {
    samplesAtTimestamps: async function* () {
      yield { draw: vi.fn(), close: vi.fn() } as never;
    },
  };
  try {
    expect(region.perspective).toBeUndefined();
    await renderRenderWindowFrames({
      window: {
        segment: {
          sourceStart: 0,
          sourceEnd: 2,
          resultStart: 0,
          resultEnd: 2,
          kind: 'keep',
          rate: 1,
        },
        timestamps: [0.5],
        sourceTimes: [0.5],
      },
      fps: 2,
      fragmentOffset: 0,
      zoomRegions: [region],
      background: { enabled: false },
      comments: [],
      canvas: { width: 320, height: 180 } as HTMLCanvasElement,
      sourceSize: { width: 320, height: 180 },
      context: contextFixture(),
      image: null,
      frameSink: frameSink as never,
      videoOut,
      resultDuration: 2,
      onProgress: vi.fn(),
      signal: new AbortController().signal,
    });
    expect(open).toHaveBeenCalledOnce();
    expect(draw).toHaveBeenCalled();
    expect(videoOut.add).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  } finally {
    open.mockRestore();
  }
});
