// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { appleCursorDataUrl, cursorMotionArtwork } from './paint';
import { CURSOR_MOTION_SHAPES, type CursorMotion } from './index';

const motion: CursorMotion = {
  id: 'cursor',
  start: 1,
  end: 4,
  enabled: true,
  shape: 'arrow',
  size: 48,
  color: '#123456',
  outline: '#ffffff',
  shadow: true,
  easing: 'linear',
  points: [
    { id: 'a', at: 0, x: 0.25, y: 0.5 },
    { id: 'b', at: 1, x: 0.75, y: 0.5 },
  ],
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('places each Apple shape with its hotspot and caches unchanged artwork across times', () => {
  const context = { fill: vi.fn(), stroke: vi.fn() };
  const acquire = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,cursor'
  );
  vi.stubGlobal(
    'Path2D',
    class {
      constructor(public path: string) {}
    }
  );
  for (const shape of CURSOR_MOTION_SHAPES) {
    const m = { ...motion, shape };
    const first = cursorMotionArtwork([m], 1, { x: 10, y: 20, width: 640, height: 360 }, 720)!;
    const later = cursorMotionArtwork([m], 2.5, { x: 10, y: 20, width: 640, height: 360 }, 720)!;
    expect(first.rect.width).toBe(24);
    expect(later.rect.x - first.rect.x).toBe(160);
    expect(later.rect.y).toBe(first.rect.y);
    expect(later.canvas).toBe(first.canvas);
    expect(appleCursorDataUrl(shape, m.color, m.outline, true)).toContain('data:image/png');
  }
  expect(acquire).toHaveBeenCalledTimes(CURSOR_MOTION_SHAPES.length);
  expect(context.fill).toHaveBeenCalled();
  expect(context.stroke).toHaveBeenCalled();
  expect(cursorMotionArtwork([motion], 4, { x: 0, y: 0, width: 1, height: 1 }, 1)).toBeNull();
  expect(cursorMotionArtwork(undefined, 2, { x: 0, y: 0, width: 1, height: 1 }, 1)).toBeNull();
});

it('bounds appearance cache and refuses an unavailable drawing context', () => {
  vi.stubGlobal('Path2D', class {});
  const acquire = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue({ fill: vi.fn(), stroke: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,cursor'
  );
  const old = cursorMotionArtwork(
    [{ ...motion, color: '#010101', shadow: false }],
    2,
    { x: 0, y: 0, width: 100, height: 100 },
    100
  )!;
  for (let i = 10; i < 65; i++)
    appleCursorDataUrl('arrow', `#${i.toString(16).padStart(6, '0')}`, '#ffffff', false);
  const next = cursorMotionArtwork(
    [{ ...motion, color: '#010101', shadow: false }],
    2,
    { x: 0, y: 0, width: 100, height: 100 },
    100
  )!;
  expect(next.canvas).not.toBe(old.canvas);
  acquire.mockReturnValue(null);
  expect(() => appleCursorDataUrl('arrow', '#abcdef', '#123123', false)).toThrow(
    'Cursor artwork context unavailable'
  );
});
