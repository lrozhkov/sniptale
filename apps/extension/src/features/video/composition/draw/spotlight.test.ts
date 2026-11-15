// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSceneSpotlightMasks, drawSceneSpotlights } from './spotlight';

const { drawLens } = vi.hoisted(() => ({ drawLens: vi.fn() }));
vi.mock('./scene-lens', () => ({ drawSceneLens: drawLens }));

const opening = { x: 20, y: 10, width: 60, height: 40 };
const frame = {
  opening,
  radius: 4,
  dim: 0,
  blur: 0,
  lens: { scale: 2, optics: 'optical' as const },
};
const source = document.createElement('canvas');
source.width = 320;
source.height = 180;

function context() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  vi.stubGlobal(
    'Path2D',
    class {
      moveTo() {}
      lineTo() {}
      closePath() {}
    }
  );
  drawLens.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('paints a single timed lens inside its opening without building a dim mask', () => {
  const target = context();
  drawSceneSpotlights(target, source, null, [frame]);
  expect(drawLens).toHaveBeenCalledWith(target, source, opening, frame.lens, frame.radius);
  expect(target.clip).toHaveBeenCalledOnce();
  expect(target.save).toHaveBeenCalledOnce();
  expect(target.restore).toHaveBeenCalledOnce();
});

it('samples concurrent lenses from one original scene and clips a projected opening', () => {
  const target = context();
  const snapshot = context();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(snapshot);
  const projection = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
  const clip = { rect: { x: 0, y: 0, width: 160, height: 90 }, radius: 5 };
  drawSceneSpotlights(target, source, null, [
    { ...frame, projection, clip },
    { ...frame, opening: { ...opening, x: 90 }, lens: { scale: 3, optics: 'flat' } },
  ]);
  expect(snapshot.drawImage).toHaveBeenCalledWith(source, 0, 0);
  expect(drawLens).toHaveBeenCalledTimes(2);
  expect(drawLens.mock.calls[0]![1]).toBe(drawLens.mock.calls[1]![1]);
  expect(drawLens.mock.calls[0]![2]).toEqual(opening);
  expect(target.clip).toHaveBeenCalledTimes(3);
});

it('skips inactive lens frames without touching scene pixels', () => {
  drawSceneSpotlights(context(), source, null, [
    { ...frame, lens: { scale: 1, optics: 'optical' } },
  ]);
  expect(drawLens).not.toHaveBeenCalled();
});

it('forwards an explicit per-demand sharp painter through the single-mask fast path', () => {
  const target = context();
  const sharpPaint = vi.fn();
  drawSceneSpotlights(target, source, null, [{ ...frame, sharpPaint }]);
  expect(drawLens).toHaveBeenCalledExactlyOnceWith(
    target,
    source,
    opening,
    frame.lens,
    frame.radius,
    sharpPaint
  );
});

function maskPixels() {
  const read = vi.fn((_x: number, _y: number, width: number, height: number) => ({
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  }));
  const paint = {
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    resetTransform: vi.fn(),
    getImageData: read,
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }),
    putImageData: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    paint as unknown as CanvasRenderingContext2D
  );
  return { read, paint };
}

it('reads only changing opening coverage while retaining full-size mask surfaces', () => {
  const { read } = maskPixels();
  const masks = createSceneSpotlightMasks({ width: 1280, height: 720 }, [
    { opening: { x: 100, y: 80, width: 40, height: 30 }, radius: 4, dim: 0.7, blur: 12 },
  ]);
  try {
    expect([masks.dim.width, masks.dim.height, masks.blur.width, masks.blur.height]).toEqual([
      1280, 720, 1280, 720,
    ]);
    const pixels = read.mock.calls.reduce((sum, [, , width, height]) => sum + width * height, 0);
    expect(pixels).toBeLessThanOrEqual(44 * 34);
    expect(read).toHaveBeenCalled();
  } finally {
    masks.dispose();
  }
  expect(masks.dim.width).toBe(0);
  expect(masks.blur.width).toBe(0);
});

it('keeps full-tile coverage for a projection with an unsafe denominator', () => {
  const { read } = maskPixels();
  const masks = createSceneSpotlightMasks({ width: 1280, height: 720 }, [
    {
      opening: { x: 100, y: 80, width: 40, height: 30 },
      radius: 4,
      dim: 0.7,
      blur: 12,
      projection: [1, 0, 0, 0, 1, 0, -0.02, 0, 1],
    },
  ]);
  try {
    expect(read.mock.calls.reduce((sum, [, , width, height]) => sum + width * height, 0)).toBe(
      1280 * 720
    );
  } finally {
    masks.dispose();
  }
});

it('does not read coverage for an opening entirely outside the output', () => {
  const { read } = maskPixels();
  const masks = createSceneSpotlightMasks({ width: 1280, height: 720 }, [
    {
      opening: { x: 1400, y: 80, width: 40, height: 30 },
      radius: 4,
      dim: 0.7,
      blur: 12,
    },
  ]);
  try {
    expect(read).not.toHaveBeenCalled();
  } finally {
    masks.dispose();
  }
});

it('releases all exclusive masks and working bytes when opening readback fails', () => {
  const { read, paint } = maskPixels();
  read.mockImplementationOnce(() => {
    throw new Error('Readback failed');
  });
  const releases: ReturnType<typeof vi.fn>[] = [];
  const byteRelease = vi.fn();
  const resources = {
    canvas: (_role: string, size: { width: number; height: number }) => {
      const canvas = Object.assign(document.createElement('canvas'), size);
      const release = vi.fn();
      releases.push(release);
      return { canvas, context: paint as unknown as CanvasRenderingContext2D, release };
    },
    bytes: () => ({ release: byteRelease }),
  };
  expect(() =>
    createSceneSpotlightMasks(
      { width: 1280, height: 720 },
      [
        {
          opening: { x: 100, y: 80, width: 40, height: 30 },
          radius: 4,
          dim: 0.7,
          blur: 12,
        },
      ],
      resources
    )
  ).toThrow('Readback failed');
  expect(releases).toHaveLength(3);
  for (const release of releases) expect(release).toHaveBeenCalledOnce();
  expect(byteRelease).toHaveBeenCalledOnce();
});
