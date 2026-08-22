import { beforeEach, describe, expect, it, vi } from 'vitest';

const samples = vi.hoisted(() => [] as Array<{ frame: unknown; init: unknown }>);

vi.mock('mediabunny', () => ({
  VideoSample: class {
    constructor(frame: unknown, init: unknown) {
      samples.push({ frame, init });
    }
  },
}));

import { LiveVideoFrameTransformer } from './live-video-frame-transform';

const drawImage = vi.fn();
const fillRect = vi.fn();
const context = {
  drawImage,
  fillRect,
  fillStyle: '',
  imageSmoothingEnabled: false,
  imageSmoothingQuality: 'low',
};

function createFrame(): VideoFrame {
  return new VideoFrame(new Uint8Array(4), {
    codedHeight: 1,
    codedWidth: 1,
    format: 'RGBA',
    timestamp: 0,
  });
}

beforeEach(() => {
  samples.length = 0;
  drawImage.mockReset();
  fillRect.mockReset();
  context.fillStyle = '';
  context.imageSmoothingEnabled = false;
  context.imageSmoothingQuality = 'low';
  vi.stubGlobal('VideoFrame', class {});
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      readonly context = context;
      constructor(
        readonly width: number,
        readonly height: number
      ) {}
      getContext() {
        return this.context;
      }
    }
  );
});

describe('live video frame transformer', () => {
  it('reuses one opaque high-quality canvas and fully overwrites fill output', () => {
    const transformer = new LiveVideoFrameTransformer({
      fit: 'fill',
      outputSize: { height: 720, width: 1280 },
      sourceRect: { height: 900, width: 1600, x: 10, y: 20 },
    });
    const frame = createFrame();

    transformer.transformFrame(frame, { duration: 1 / 60, keyFrame: true, timestamp: 2 });
    transformer.transformFrame(frame, { duration: 1 / 60, keyFrame: false, timestamp: 2 + 1 / 60 });

    expect(context).toMatchObject({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });
    expect(fillRect).not.toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(drawImage).toHaveBeenCalledWith(frame, 10, 20, 1600, 900, 0, 0, 1280, 720);
    expect(samples).toHaveLength(2);
  });

  it('clears contain bars and centers the scaled source', () => {
    const transformer = new LiveVideoFrameTransformer({
      fit: 'contain',
      outputSize: { height: 1000, width: 1000 },
      sourceRect: { height: 900, width: 1600, x: 0, y: 0 },
    });
    const frame = createFrame();

    transformer.transformFrame(frame, { duration: 1 / 30, keyFrame: false, timestamp: 0 });

    expect(context.fillStyle).toBe('black');
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1000, 1000);
    expect(drawImage).toHaveBeenCalledWith(frame, 0, 0, 1600, 900, 0, 218.75, 1000, 562.5);
  });

  it('covers without bars by centering the oversized destination', () => {
    const transformer = new LiveVideoFrameTransformer({
      fit: 'cover',
      outputSize: { height: 1000, width: 1000 },
      sourceRect: { height: 900, width: 1600, x: 0, y: 0 },
    });
    const frame = createFrame();

    transformer.transformFrame(frame, { duration: 1 / 30, keyFrame: false, timestamp: 0 });

    expect(fillRect).not.toHaveBeenCalled();
    expect(drawImage.mock.calls[0]?.slice(1)).toEqual([
      0,
      0,
      1600,
      900,
      expect.closeTo(-388.888_888_888_888_9),
      0,
      expect.closeTo(1777.777_777_777_777_8),
      1000,
    ]);
  });

  it('fails explicitly when the canvas surface is unavailable', () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(
      () =>
        new LiveVideoFrameTransformer({
          fit: 'fill',
          outputSize: { height: 2, width: 2 },
          sourceRect: { height: 2, width: 2, x: 0, y: 0 },
        })
    ).toThrow('require OffscreenCanvas');
  });

  it('fails explicitly when no 2D context can be created', () => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return null;
        }
      }
    );
    expect(
      () =>
        new LiveVideoFrameTransformer({
          fit: 'fill',
          outputSize: { height: 2, width: 2 },
          sourceRect: { height: 2, width: 2, x: 0, y: 0 },
        })
    ).toThrow('require a 2D OffscreenCanvas context');
  });
});
