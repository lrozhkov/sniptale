import { drawCompositionBorders } from './draw/border';
import { expect, it, vi } from 'vitest';
import { createQuickEditBorder, type QuickEditBorder } from '../project/scene/focus-appearance';
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

it.each(['solid', 'dashed', 'dotted'] as const)(
  'uses actual non-square %s contour distances for all origins',
  (style) => {
    for (const roundness of [0, 0.11, 0.5]) {
      const border = {
        ...createQuickEditBorder(),
        area: { x: 0, y: 0, width: 1, height: 1 },
        width: 2,
        style,
        roundness,
        reveal: 'draw' as const,
      };
      const sample = (origin: QuickEditBorder) =>
        sampleSceneBorder({
          id: 'origin',
          border: origin,
          clock: {
            time: 0,
            duration: 4,
            enter: { type: 'linear', duration: 1 },
            exit: { type: 'linear', duration: 1 },
          },
          window: { x: 0, y: 0, width: 400, height: 100 },
          scale: 1,
        })[0]!;
      const r = Math.max(0, 100 * roundness - 1);
      const steps = Math.max(4, Math.ceil((Math.PI / 2) * Math.sqrt(r / 0.2)));
      const arc =
        style === 'solid' ? (Math.PI * r) / 2 : steps * 2 * r * Math.sin(Math.PI / (4 * steps));
      const perimeter = 2 * (398 + 98 - 4 * r) + 4 * arc;
      const expected = {
        'top-center': 0,
        'top-right': 199 - r + arc / 2,
        'bottom-right': 199 - r + arc * 1.5 + 98 - 2 * r,
        'bottom-left': 199 - r + arc * 2.5 + 98 - 2 * r + 398 - 2 * r,
        'top-left': 199 - r + arc * 3.5 + 2 * (98 - 2 * r) + 398 - 2 * r,
      };
      for (const origin of [
        'top-center',
        'top-left',
        'top-right',
        'bottom-right',
        'bottom-left',
      ] as const) {
        const frame = sample({ ...border, origin });
        expect(frame.start).toBeCloseTo(expected[origin] / perimeter, 8);
        expect(frame.end).toBeCloseTo(frame.start, 8);
        expect(frame.perimeter).toBeCloseTo(perimeter, 8);
      }
      expect(sample(border)).toEqual(sample({ ...border, origin: 'top-center' }));
    }
  }
);

it('grows and contracts two sides continuously, including a partial rotating hold', () => {
  const border = {
    ...createQuickEditBorder(),
    area: { x: 0, y: 0, width: 1, height: 1 },
    origin: 'bottom-left' as const,
    reveal: 'draw-both' as const,
    exitReveal: 'erase-both' as const,
    style: 'dashed' as const,
    loop: true,
    segmentPercent: 37,
  };
  const sample = (time: number) =>
    sampleSceneBorder({
      id: 'both',
      border,
      clock: {
        time,
        duration: 4,
        enter: { type: 'linear', duration: 1 },
        exit: { type: 'linear', duration: 1 },
      },
      window: { x: 0, y: 0, width: 400, height: 100 },
      scale: 1,
    })[0]!;
  expect(sample(0).end - sample(0).start).toBe(0);
  expect(sample(0.5).end - sample(0.5).start).toBeCloseTo(0.5, 8);
  expect(sample(1).end - sample(1).start).toBeCloseTo(1, 8);
  const hold = sample(3),
    half = sample(3.5),
    end = sample(4);
  expect(hold.end - hold.start).toBeCloseTo(0.37, 8);
  expect(half.end - half.start).toBeCloseTo(0.185, 8);
  expect((half.start + half.end) / 2).toBeCloseTo((hold.start + hold.end) / 2, 8);
  expect(end.end - end.start).toBeCloseTo(0, 8);
  expect(end.dashOffset).toBe(hold.dashOffset);
  expect(sample(3.5)).toEqual(half);
});

it('places patterned origins at the painted rounded corner bisectors within the chord budget', () => {
  const border = {
    ...createQuickEditBorder(),
    style: 'dashed' as const,
    reveal: 'draw' as const,
    width: 2,
    roundness: 0.2,
    area: { x: 0, y: 0, width: 1, height: 1 },
  };
  for (const origin of ['top-right', 'bottom-right', 'bottom-left', 'top-left'] as const) {
    const frame = sampleSceneBorder({
      id: 'contour',
      border: { ...border, origin },
      clock: {
        time: 0,
        duration: 4,
        enter: { type: 'linear', duration: 1 },
        exit: { type: 'linear', duration: 1 },
      },
      window: { x: 0, y: 0, width: 400, height: 100 },
      scale: 1,
    })[0]!;
    const points = [...frame.path.matchAll(/[ML]([^ ]+) ([^MLZ]+)/g)].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
    }));
    let distance = frame.start * frame.perimeter;
    let point = points[0]!;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!,
        length = Math.hypot(b.x - a.x, b.y - a.y);
      if (distance <= length) {
        point = {
          x: a.x + ((b.x - a.x) * distance) / length,
          y: a.y + ((b.y - a.y) * distance) / length,
        };
        break;
      }
      distance -= length;
    }
    const right = origin.endsWith('right'),
      bottom = origin.startsWith('bottom');
    const r = 19,
      axis = r / Math.SQRT2;
    const expected = {
      x: (right ? 380 : 20) + (right ? axis : -axis),
      y: (bottom ? 80 : 20) + (bottom ? axis : -axis),
    };
    expect(Math.hypot(point.x - expected.x, point.y - expected.y)).toBeLessThan(0.025);
  }
});
