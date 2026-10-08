// @vitest-environment jsdom
import { VideoSample } from 'mediabunny';
import { afterEach, expect, it, vi } from 'vitest';
import { drawReviewSpotlights } from './render-spotlight';
import { renderRenderWindowFrames } from './render-export';

vi.mock('./render-spotlight', () => ({ drawReviewSpotlights: vi.fn() }));
vi.mock('mediabunny', async (original) => ({
  ...(await original<typeof import('mediabunny')>()),
  VideoSample: class {
    timestamp: number;
    draw = vi.fn();
    close = vi.fn();
    constructor(_canvas: HTMLCanvasElement, options: { timestamp: number }) {
      this.timestamp = options.timestamp;
    }
  },
}));
afterEach(() => vi.restoreAllMocks());

it.each([false, true])(
  'composes camera above Focus with global source time and releases its iterator (encoder failure=%s)',
  async (fail) => {
    const order: string[] = [];
    vi.mocked(drawReviewSpotlights).mockImplementation(() => {
      order.push('focus');
    });
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      roundRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const videoOut = {
      add: vi.fn(async (_sample: VideoSample) => {
        order.push('encode');
        if (fail) throw new Error('encoder failed');
      }),
      close: vi.fn(),
    };
    const released = vi.fn();
    const cameraTimes: number[] = [];
    const webcam = {
      dispose: vi.fn(),
      async *sourceFrames() {
        yield null;
      },
      async *frames(times: readonly number[]) {
        cameraTimes.push(...times);
        try {
          for (const _time of times)
            yield {
              draw: () => {
                order.push('webcam');
              },
            };
        } finally {
          released();
        }
      },
    };
    const frameSink = {
      async *samplesAtTimestamps(times: Iterable<number>) {
        for (const timestamp of times) yield new VideoSample(canvas, { timestamp });
      },
    };
    const operation = renderRenderWindowFrames({
      window: {
        segment: {
          sourceStart: 0,
          sourceEnd: 1,
          resultStart: 0,
          resultEnd: 1,
          kind: 'keep',
          rate: 1,
        },
        timestamps: [0, 0.5],
        sourceTimes: [0, 0.5],
      },
      fps: 2,
      fragmentOffset: 1,
      webcam,
      zoomRegions: [
        {
          id: 'z',
          start: 1,
          end: 2,
          transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
          enter: { type: 'none', duration: 0 },
          exit: { type: 'none', duration: 0 },
        },
      ],
      background: { enabled: false },
      comments: [],
      canvas,
      sourceSize: { width: 320, height: 180 },
      context,
      image: null,
      frameSink,
      videoOut,
      resultDuration: 1,
      onProgress: undefined,
      signal: new AbortController().signal,
    });
    if (fail) await expect(operation).rejects.toThrow('encoder failed');
    else {
      await expect(operation).resolves.toBe(2);
      expect(videoOut.add.mock.calls.map(([sample]) => sample.timestamp)).toEqual([0, 0.5]);
    }
    expect(cameraTimes).toEqual([0, 0.5]);
    expect(order).toEqual(
      fail
        ? ['focus', 'webcam', 'encode']
        : ['focus', 'webcam', 'encode', 'focus', 'webcam', 'encode']
    );
    expect(released).toHaveBeenCalledOnce();
  }
);
