// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { drawCursorCompositionState, resolveCursorCompositionPaintBounds } from './cursor';
import { appleCursorRaster } from '../../../project/cursor-motion/paint';
import type { VideoCompositionCursorState } from '../../types';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    drawImage: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it('renders every cursor preset and animation branch', () => {
  const context = createContext();
  const variants = [
    { animationPreset: 'NONE', preset: 'ARROW', shadow: false, time: 0 },
    { animationPreset: 'PULSE', preset: 'DOT', shadow: true, time: 0.25 },
    { animationPreset: 'FLOAT', preset: 'RING', shadow: false, time: 0.5 },
    { animationPreset: 'BREATHE', preset: 'CROSSHAIR', shadow: false, time: 0.75 },
  ] as const;

  for (const variant of variants) {
    drawCursorCompositionState(context, {
      ...variant,
      captureMode: 'embedded-fallback',
      color: '#ffffff',
      scale: 1,
      visible: true,
      x: 20,
      y: 30,
    });
  }

  expect(context.save).toHaveBeenCalledTimes(4);
  expect(context.restore).toHaveBeenCalledTimes(4);
  expect(context.translate).toHaveBeenCalledWith(20, 30);
  expect(context.moveTo).toHaveBeenCalled();
  expect(context.lineTo).toHaveBeenCalled();
  expect(context.arc).toHaveBeenCalled();
  expect(context.scale).toHaveBeenCalledTimes(4);
});

it('returns early for invisible cursor samples', () => {
  const context = createContext();

  drawCursorCompositionState(context, {
    animationPreset: 'NONE',
    captureMode: 'separate',
    color: '#ffffff',
    preset: 'ARROW',
    scale: 1,
    shadow: false,
    time: 0,
    visible: false,
    x: 0,
    y: 0,
  });

  expect(context.save).not.toHaveBeenCalled();
  expect(context.translate).not.toHaveBeenCalled();
});

const state: VideoCompositionCursorState = {
  animationPreset: 'NONE',
  captureMode: 'separate',
  color: '#ffffff',
  preset: 'ARROW',
  scale: 0.25,
  shadow: false,
  time: 0,
  visible: true,
  x: 200,
  y: 150,
};
it('paints transferred Apple artwork with the same hotspot and bounds used by composition', () => {
  vi.stubGlobal('Path2D', class {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fill: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  const cursor = {
    ...state,
    artwork: { shape: 'pointer' as const, color: '#eeeeee', outline: '#222222', shadow: true },
  };
  const raster = appleCursorRaster(cursor.artwork);
  const context = createContext();
  drawCursorCompositionState(context, cursor);
  expect(context.drawImage).toHaveBeenCalledWith(
    raster.canvas,
    -raster.hotspot[0]!,
    -raster.hotspot[1]!
  );
  expect(context.restore).toHaveBeenCalledTimes(1);
  expect(context.beginPath).not.toHaveBeenCalled();
  expect(resolveCursorCompositionPaintBounds(cursor)).toEqual({
    x: cursor.x - raster.hotspot[0]! * cursor.scale - 2,
    y: cursor.y - raster.hotspot[1]! * cursor.scale - 2,
    width: 68,
    height: 68,
  });
  expect(resolveCursorCompositionPaintBounds({ ...cursor, visible: false })).toBeNull();
});
it.each(['ARROW', 'DOT', 'RING', 'CROSSHAIR'] as const)(
  'keeps %s paint and its shadow inside declared bounds',
  (preset) => {
    const plain = resolveCursorCompositionPaintBounds({ ...state, preset })!;
    const shadow = resolveCursorCompositionPaintBounds({ ...state, preset, shadow: true })!;
    expect(plain.width).toBeGreaterThan(0);
    expect(plain.height).toBeGreaterThan(0);
    expect(shadow.x).toBeLessThan(plain.x);
    expect(shadow.y).toBeLessThan(plain.y);
    expect(shadow.x + shadow.width).toBeGreaterThan(plain.x + plain.width);
    expect(shadow.y + shadow.height).toBeGreaterThan(plain.y + plain.height);
    const float = resolveCursorCompositionPaintBounds({
      ...state,
      preset,
      animationPreset: 'FLOAT',
      time: 0.1,
    })!;
    expect(float.y).not.toBe(plain.y);
    expect(float.height).toBe(plain.height);
  }
);
