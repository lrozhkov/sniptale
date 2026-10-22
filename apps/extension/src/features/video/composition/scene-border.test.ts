import { drawCompositionBorders } from './draw/border';
import { expect, it, vi } from 'vitest';
import { createQuickEditBorder } from '../project/scene/focus-appearance';
import type { CameraTransitionType } from '../project/motion/transitions';
import { sampleSceneBorder } from './scene-border';

it.each<{ type: CameraTransitionType; enter: number; exit: number }>([
  { type: 'none', enter: 1, exit: 1 },
  { type: 'linear', enter: 0.25, exit: 0.75 },
  { type: 'ease-in-out', enter: 0.15625, exit: 0.84375 },
  { type: 'ease-out', enter: 0.4375, exit: 0.5625 },
  { type: 'instant', enter: 1, exit: 0 },
])('uses $type phases at retained animation times', ({ type, enter, exit }) => {
  const sample = (time: number) =>
    sampleSceneBorder({
      id: 'border',
      border: createQuickEditBorder(),
      clock: { time, duration: 4, enter: { type, duration: 1 }, exit: { type, duration: 1 } },
      window: { x: 100, y: 50, width: 400, height: 200 },
      scale: 2,
    })[0]!;
  expect(sample(0.25).opacity).toBeCloseTo(enter, 12);
  expect(sample(3.25).opacity).toBeCloseTo(exit, 12);
  expect(sample(2)).toMatchObject({
    id: 'border',
    width: 6,
    color: '#ff8800ff',
    style: 'solid',
    opacity: 1,
  });
  expect(sample(2).path).toMatch(/^M300 103H/);
});

it('keeps instantaneous and disabled phases distinct at the exact authored boundary', () => {
  const args = {
    id: 'border',
    border: createQuickEditBorder(),
    window: { x: 0, y: 0, width: 400, height: 200 },
    scale: 1,
  };
  expect(
    sampleSceneBorder({
      ...args,
      clock: {
        time: 0,
        duration: 4,
        enter: { type: 'instant', duration: 1 },
        exit: { type: 'none', duration: 0 },
      },
    })[0]?.opacity
  ).toBe(0);
  expect(
    sampleSceneBorder({
      ...args,
      clock: {
        time: 0,
        duration: 4,
        enter: { type: 'none', duration: 1 },
        exit: { type: 'none', duration: 0 },
      },
    })[0]?.opacity
  ).toBe(1);
});

it('keeps ripple energy inside the retained hold and uses one independent outline', () => {
  const sample = (time: number) =>
    sampleSceneBorder({
      id: 'ripple',
      border: { ...createQuickEditBorder(), loop: true, motion: 'ripple' },
      clock: {
        time,
        duration: 4,
        enter: { type: 'linear', duration: 1 },
        exit: { type: 'linear', duration: 1 },
      },
      window: { x: 0, y: 0, width: 400, height: 200 },
      scale: 1,
    });
  expect(sample(1)).toHaveLength(1);
  expect(sample(3)).toHaveLength(1);
  const active = sample(1.5);
  expect(active).toHaveLength(2);
  expect(active[1]).toMatchObject({ id: 'ripple:ripple', start: 0, end: 1 });
  expect(active[1]!.opacity).toBeCloseTo(0.6 * Math.SQRT1_2, 12);
  expect(active[1]!.perimeter).toBeGreaterThan(active[0]!.perimeter);
});

it.each(['source', 'window', 'legacy'] as const)(
  'paints a %s border in its source geometry under a fixed visible crop',
  (attachment) => {
    class StrokePath {
      constructor(readonly path: string) {}
    }
    vi.stubGlobal('Path2D', StrokePath);
    const surfaces: { stroke: ReturnType<typeof vi.fn>; lineWidth: number }[] = [];
    const document = {
      createElement: () => {
        const surface = {
          clearRect: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          setTransform: vi.fn(),
          setLineDash: vi.fn(),
          stroke: vi.fn(),
          lineWidth: 0,
        };
        surfaces.push(surface);
        return { width: 0, height: 0, getContext: () => surface };
      },
    };
    const context = {
      canvas: { width: 400, height: 300, ownerDocument: document },
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      setTransform: vi.fn(),
      getTransform: () => ({ a: 1, d: 1 }),
      globalAlpha: 1,
    };
    const visible = { x: 10, y: 20, width: 100, height: 80 };
    try {
      drawCompositionBorders(
        context as unknown as CanvasRenderingContext2D,
        [
          {
            id: 'border',
            ...(attachment === 'window' ? {} : { coordinateSpace: 'source-window' as const }),
            border: {
              ...createQuickEditBorder(),
              area: { x: 0, y: 0, width: 1, height: 1 },
              width: 2,
              roundness: 0,
              style: 'solid',
            },
            clock: {
              time: 1,
              duration: 3,
              enter: { type: 'none', duration: 0 },
              exit: { type: 'none', duration: 0 },
            },
          },
        ],
        visible,
        1,
        6,
        attachment === 'legacy' ? undefined : { x: -10, y: 0, width: 200, height: 160 },
        attachment === 'legacy' ? undefined : [2, 0, -30, 0, 2, -40, 0, 0, 1]
      );
      expect(context.roundRect).toHaveBeenCalledExactlyOnceWith(10, 20, 100, 80, 6);
      expect(context.clip).toHaveBeenCalledOnce();
      expect(surfaces[0]!.lineWidth).toBe(attachment === 'source' ? 4 : 2);
      const path = surfaces[0]!.stroke.mock.calls[0]![0] as StrokePath;
      expect(path.path).toBe(
        attachment === 'source' ? 'M150 -38H348V278H-48V-38H150Z' : 'M60 21H109V99H11V21H60Z'
      );
      expect(context.drawImage).toHaveBeenCalledOnce();
      expect(context.save).toHaveBeenCalledTimes(context.restore.mock.calls.length);
    } finally {
      vi.unstubAllGlobals();
    }
  }
);
