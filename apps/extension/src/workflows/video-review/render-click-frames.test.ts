import { contextFixture } from './render-export.test-support';
import { expect, it, vi } from 'vitest';
import { VideoSample } from 'mediabunny';
import { renderRenderWindowFrames } from './render-export';
import { drawSceneSpotlights } from '../../features/video/composition/draw/spotlight';
import { createCanvasComment } from '../../features/video/review/comments';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/review/advanced/click-animation';

it('uses global fragment time and paints clicks after focus, before viewport comments and encoding', async () => {
  const context = contextFixture();
  const add = vi.fn(async () => undefined);
  const comment = {
    ...createCanvasComment({ id: 'note', at: 0 }),
    resolvedText: 'Above click',
    attachment: 'viewport' as const,
    renderToVideo: true,
    start: 0,
    end: 5,
  };
  await renderRenderWindowFrames({
    window: {
      segment: {
        kind: 'keep',
        rate: 1,
        sourceStart: 0,
        sourceEnd: 1,
        resultStart: 0,
        resultEnd: 1,
      },
      timestamps: [0, 0.5],
      sourceTimes: [0, 0.5],
    },
    fps: 2,
    fragmentOffset: 2,
    zoomRegions: [],
    background: { enabled: false },
    comments: [comment],
    clickCues: [
      {
        settings: { ...REVIEW_CLICK_DEFAULT, effect: 'ripple' },
        point: { x: 0.25, y: 0.5 },
        anchor: 2,
        start: 2,
        end: 2.3,
      },
    ],
    canvas: { width: 320, height: 180 } as HTMLCanvasElement,
    sourceSize: { width: 320, height: 180 },
    context,
    image: null,
    frameSink: {
      async *samplesAtTimestamps(times) {
        for await (const timestamp of times)
          yield new VideoSample(document.createElement('canvas'), { timestamp });
      },
    },
    videoOut: { add, close() {} },
    resultDuration: 1,
    onProgress: undefined,
    signal: new AbortController().signal,
  });
  expect(vi.mocked(context.arc).mock.calls.filter((call) => call[0] === 80)).toHaveLength(1);
  expect(context.arc).toHaveBeenCalledWith(80, 90, 9.6, 0, 2 * Math.PI);
  const order = (fn: unknown) =>
    vi.mocked(fn as typeof context.stroke).mock.invocationCallOrder[0]!;
  expect(order(drawSceneSpotlights)).toBeLessThan(order(context.arc));
  expect(order(context.stroke)).toBeLessThan(order(context.fillText));
  expect(order(context.fillText)).toBeLessThan(order(add));
});
