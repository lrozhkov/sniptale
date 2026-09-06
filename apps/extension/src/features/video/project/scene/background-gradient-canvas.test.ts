import { afterEach, expect, it, vi } from 'vitest';
import { getShowcaseGradient } from '../../../highlighter/showcase-resources';
import { drawSceneGradient } from './background-gradient-canvas';

function contextFixture() {
  const addColorStop = vi.fn();
  const gradient = () => ({ addColorStop });
  const calls = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    createLinearGradient: vi.fn(gradient),
    createRadialGradient: vi.fn(gradient),
    createConicGradient: vi.fn(gradient),
  };
  return { calls, addColorStop, context: calls as unknown as CanvasRenderingContext2D };
}

afterEach(() => vi.unstubAllGlobals());

it.each(['system-ocean', 'system-radial-glow', 'system-conic-spectrum'] as const)(
  'draws %s and its repeated variant using canonical geometry',
  (id) => {
    for (const repeated of [false, true]) {
      const gradient = getShowcaseGradient(id);
      gradient.repeat = { enabled: repeated, span: 0.8 };
      const { context, calls, addColorStop } = contextFixture();
      drawSceneGradient(context, gradient, 200, 100);
      expect(calls.save).toHaveBeenCalledOnce();
      expect(calls.restore).toHaveBeenCalledOnce();
      expect(addColorStop.mock.calls.every(([offset]) => offset >= 0 && offset <= 1)).toBe(true);
      if (gradient.type === 'radial') {
        expect(calls.translate).toHaveBeenCalledWith(100, 50);
        expect(calls.scale).toHaveBeenCalledWith(144, 72);
        expect(calls.createRadialGradient).toHaveBeenCalledOnce();
      } else if (gradient.type === 'conic') {
        expect(calls.createConicGradient).toHaveBeenCalledWith(
          ((24 - 90) * Math.PI) / 180,
          100,
          50
        );
      } else expect(calls.createLinearGradient).toHaveBeenCalledOnce();
    }
  }
);

it('retains authored hard stops and handles a zero-width repeated gradient', () => {
  const gradient = getShowcaseGradient('system-ocean');
  gradient.interpolation = 'srgb';
  gradient.stops[1]!.position = 0;
  const { context, addColorStop } = contextFixture();
  drawSceneGradient(context, gradient, 100, 100);
  expect(addColorStop.mock.calls.slice(0, 2)).toEqual([
    [0, '#06b6d4ff'],
    [0, '#2563ebff'],
  ]);
  gradient.stops.forEach((stop) => {
    stop.position = 0.5;
  });
  gradient.repeat.enabled = true;
  addColorStop.mockClear();
  drawSceneGradient(context, gradient, 100, 100);
  expect(addColorStop).toHaveBeenCalledOnce();
  expect(addColorStop).toHaveBeenCalledWith(0, '#312e81ff');
});

it.each(['system-ocean', 'system-radial-glow', 'system-conic-spectrum'] as const)(
  'bounds dense %s repetition by output pixels',
  (id) => {
    const putImageData = vi.fn();
    class RasterSurface {
      constructor(
        public width: number,
        public height: number
      ) {}
      getContext() {
        return {
          createImageData: (width: number, height: number) => ({
            data: new Uint8ClampedArray(width * height * 4),
          }),
          putImageData,
        };
      }
    }
    vi.stubGlobal('OffscreenCanvas', RasterSurface);
    const gradient = getShowcaseGradient(id);
    gradient.repeat = { enabled: true, span: 0.01 };
    const { context, calls } = contextFixture();
    drawSceneGradient(context, gradient, 8, 4);
    expect(putImageData).toHaveBeenCalledOnce();
    expect(putImageData.mock.calls[0]![0].data).toHaveLength(128);
    expect(calls.drawImage).toHaveBeenCalledWith(expect.any(RasterSurface), 0, 0, 8, 4);
    expect(calls.createLinearGradient).not.toHaveBeenCalled();
  }
);

it('samples premultiplied colors when neighboring stop opacities differ', () => {
  const gradient = getShowcaseGradient('system-ocean');
  gradient.interpolation = 'srgb';
  gradient.stops[0]!.color = '#ff000000';
  gradient.stops[1]!.color = '#0000ff80';
  const { context, addColorStop } = contextFixture();
  drawSceneGradient(context, gradient, 100, 100);
  expect(addColorStop).toHaveBeenCalledWith(0.25, '#0000ff40');
});

it('uses integer raster rows for fractional preview bounds and scales back to the stage', () => {
  const allocate = vi.fn();
  const putImageData = vi.fn();
  class RasterSurface {
    constructor(width: number, height: number) {
      allocate(width, height);
    }
    getContext() {
      return {
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        putImageData,
      };
    }
  }
  vi.stubGlobal('OffscreenCanvas', RasterSurface);
  const gradient = getShowcaseGradient('system-ocean');
  gradient.repeat = { enabled: true, span: 0.01 };
  const { context, calls } = contextFixture();
  drawSceneGradient(context, gradient, 8.5, 4.5);
  expect(allocate).toHaveBeenCalledWith(9, 5);
  const pixels: Uint8ClampedArray = putImageData.mock.calls[0]![0].data;
  expect(pixels).toHaveLength(180);
  expect(pixels.filter((_, index) => index % 4 === 3).every((alpha) => alpha === 255)).toBe(true);
  expect(calls.drawImage).toHaveBeenCalledWith(expect.any(RasterSurface), 0, 0, 8.5, 4.5);
});
