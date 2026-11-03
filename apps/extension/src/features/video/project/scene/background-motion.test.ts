import { afterEach, expect, it, vi } from 'vitest';
import { acquireVideoCompositionBuffer } from '../../composition/canvas/buffer-pool';
import {
  evaluateSceneBackgroundMotion,
  hasSceneBackgroundMotion,
  parseSceneBackgroundMotion,
} from './background-motion';
import {
  drawSceneBackgroundMotion,
  releaseSceneBackgroundMotionRaster,
} from './background-motion-canvas';

vi.mock('../../composition/canvas/buffer-pool', () => ({ acquireVideoCompositionBuffer: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(acquireVideoCompositionBuffer).mockReset();
});

it('admits only finite bounded motion settings without replacing invalid values', () => {
  for (const mode of ['none', 'drift', 'glow', 'waves']) {
    expect(parseSceneBackgroundMotion({ mode, speed: 0, intensity: 100 })).toEqual({
      mode,
      speed: 0,
      intensity: 100,
    });
  }
  for (const value of [
    null,
    {},
    { mode: 'aurora', speed: 50, intensity: 50 },
    { mode: 'drift', speed: NaN, intensity: 50 },
    { mode: 'glow', speed: 101, intensity: 50 },
    { mode: 'waves', speed: '50', intensity: 50 },
    { mode: 'waves', speed: 50, intensity: -1 },
  ]) {
    expect(parseSceneBackgroundMotion(value)).toBeNull();
  }
});

it('holds the original paint for off and zero controls, and evaluates seek-independent programme time', () => {
  expect(hasSceneBackgroundMotion(undefined)).toBe(false);
  for (const settings of [
    { mode: 'none' as const, speed: 50, intensity: 50 },
    { mode: 'waves' as const, speed: 0, intensity: 100 },
    { mode: 'drift' as const, speed: 50, intensity: 0 },
  ])
    expect(hasSceneBackgroundMotion(settings)).toBe(false);
  const settings = { mode: 'glow' as const, speed: 50, intensity: 75 };
  const forward = Array.from({ length: 60 }, (_, frame) =>
    evaluateSceneBackgroundMotion(settings, frame / 30)
  );
  for (let frame = 59; frame >= 0; frame -= 7)
    expect(evaluateSceneBackgroundMotion(settings, frame / 30)).toEqual(forward[frame]);
  expect(evaluateSceneBackgroundMotion(settings, 4)).not.toEqual(
    evaluateSceneBackgroundMotion(settings, 9)
  );
  expect(evaluateSceneBackgroundMotion(settings, 124)).toEqual(
    evaluateSceneBackgroundMotion(settings, 4)
  );
  expect(evaluateSceneBackgroundMotion({ ...settings, speed: 100 }, 2)).toEqual(
    evaluateSceneBackgroundMotion(settings, 4)
  );
});

function context() {
  return {
    canvas: {},
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  } as unknown as CanvasRenderingContext2D;
}

it('reuses bounded paint rasters, renders seek parity and releases replaced or expired resources', () => {
  vi.useFakeTimers();
  const target = context();
  const source = context();
  const release = vi.fn();
  const canvas = {
    width: 2048,
    height: 1024,
    getContext: () => source,
  } as unknown as OffscreenCanvas;
  vi.mocked(acquireVideoCompositionBuffer).mockReturnValue({ canvas, release });
  const paint = vi.fn();
  const args = {
    context: target,
    width: 4096,
    height: 2048,
    motion: { mode: 'waves' as const, speed: 50, intensity: 70 },
    currentTime: 3,
    paintKey: 'paint',
    image: null,
    paint,
  };
  drawSceneBackgroundMotion(args);
  const first = vi.mocked(target.drawImage).mock.calls.slice();
  expect(first).toHaveLength(96);
  expect(acquireVideoCompositionBuffer).toHaveBeenCalledWith(2048, 1024, undefined);
  expect(paint).toHaveBeenCalledOnce();
  drawSceneBackgroundMotion({ ...args, currentTime: 11 });
  vi.mocked(target.drawImage).mockClear();
  drawSceneBackgroundMotion(args);
  expect(vi.mocked(target.drawImage).mock.calls).toEqual(first);
  expect(paint).toHaveBeenCalledOnce();
  drawSceneBackgroundMotion({ ...args, paintKey: 'replacement' });
  expect(release).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(1001);
  expect(release).toHaveBeenCalledTimes(2);
  releaseSceneBackgroundMotionRaster(target);
  expect(release).toHaveBeenCalledTimes(2);
});

it('propagates allocation and paint failures without retaining incomplete output', () => {
  const args = {
    context: context(),
    width: 400,
    height: 200,
    motion: { mode: 'drift' as const, speed: 50, intensity: 50 },
    currentTime: 0,
    paintKey: 'paint',
    image: null,
    paint: vi.fn(),
  };
  vi.mocked(acquireVideoCompositionBuffer).mockReturnValue(null);
  expect(() => drawSceneBackgroundMotion(args)).toThrow('unavailable');
  const release = vi.fn();
  const source = context();
  vi.mocked(acquireVideoCompositionBuffer).mockReturnValue({
    canvas: { getContext: () => source } as unknown as OffscreenCanvas,
    release,
  });
  expect(() =>
    drawSceneBackgroundMotion({
      ...args,
      paint: () => {
        throw new Error('paint failed');
      },
    })
  ).toThrow('paint failed');
  expect(release).toHaveBeenCalledOnce();
});

it('releases an unusable borrowed raster and retries without changing completed output', () => {
  const target = context();
  const release = vi.fn();
  const acquire = vi.fn(() => ({
    canvas: { getContext: () => null } as unknown as OffscreenCanvas,
    release,
  }));
  const args = {
    context: target,
    width: 400,
    height: 200,
    motion: { mode: 'drift' as const, speed: 50, intensity: 50 },
    currentTime: 2,
    paintKey: 'borrowed',
    image: null,
    acquire,
    paint: vi.fn(),
  };
  expect(() => drawSceneBackgroundMotion(args)).toThrow('unavailable');
  expect(release).toHaveBeenCalledOnce();
  expect(args.paint).not.toHaveBeenCalled();
  expect(target.drawImage).not.toHaveBeenCalled();
  const source = context();
  acquire.mockReturnValue({
    canvas: { getContext: () => source } as unknown as OffscreenCanvas,
    release,
  });
  drawSceneBackgroundMotion(args);
  expect(acquire).toHaveBeenCalledTimes(2);
  expect(args.paint).toHaveBeenCalledOnce();
  expect(target.drawImage).toHaveBeenCalledOnce();
  releaseSceneBackgroundMotionRaster(target);
  expect(release).toHaveBeenCalledTimes(2);
});

it('draws three bounded glow lights after the source and restores the output state on draw failure', () => {
  const target = context();
  const source = context();
  const release = vi.fn();
  const args = {
    context: target,
    width: 400,
    height: 200,
    motion: { mode: 'glow' as const, speed: 50, intensity: 50 },
    currentTime: 3,
    paintKey: 'glow',
    image: null,
    acquire: () => ({
      canvas: { getContext: () => source } as unknown as OffscreenCanvas,
      release,
    }),
    paint: vi.fn(),
  };
  drawSceneBackgroundMotion(args);
  expect(target.drawImage).toHaveBeenCalledOnce();
  expect(target.createRadialGradient).toHaveBeenCalledTimes(3);
  expect(target.fillRect).toHaveBeenCalledTimes(3);
  expect(target.restore).toHaveBeenCalledOnce();
  vi.mocked(target.drawImage).mockImplementationOnce(() => {
    throw new Error('output unavailable');
  });
  expect(() => drawSceneBackgroundMotion(args)).toThrow('output unavailable');
  expect(target.restore).toHaveBeenCalledTimes(2);
  expect(args.paint).toHaveBeenCalledOnce();
  releaseSceneBackgroundMotionRaster(target);
  expect(release).toHaveBeenCalledOnce();
});
