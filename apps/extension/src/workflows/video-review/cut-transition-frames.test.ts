import {
  evaluateCursorMotion,
  type CursorMotion,
} from '../../features/video/project/cursor-motion';
import { projectReviewFocus } from '../../features/video/review/focus-edits';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { projectReviewCursorMotions } from '../../features/video/review/timeline-placement';
import { anchorReviewVisual } from '../../features/video/review/visual-anchor';
import {
  projectReviewAnnotationEffect,
  sampleReviewAnnotationEffect,
} from '../../features/video/review/annotation-effects/timing';
import { planReviewCutTransitions, reviewCutTransitionAt } from '../../features/video/review/cuts';
import { expect, it, vi } from 'vitest';
import {
  createReviewTransitionFrames,
  isReviewTransitionFrame,
  paintReviewCutTransition,
  reviewCutTransitionSides,
  paintReviewCutDissolve,
  paintReviewCutBlackout,
  type ReviewTransitionSample,
} from './cut-transition-frames';
import type { ReviewCutTransitionPlan } from '../../features/video/review/cuts';

const plan: ReviewCutTransitionPlan = {
  id: 'cut',
  type: 'dissolve',
  seam: 2,
  before: 0.5,
  after: 0.5,
  left: { start: 0, end: 2 },
  right: { start: 4, end: 6 },
};
const frame = (timestamp: number): ReviewTransitionSample => ({
  timestamp,
  draw: vi.fn(),
  close: vi.fn(),
});

it('awaits each dissolve side before blending and propagates an asynchronous side failure', async () => {
  const target = {
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
  } as unknown as CanvasRenderingContext2D;
  const canvas = {} as HTMLCanvasElement;
  const scratch = { canvas, context: target };
  let finish!: () => void;
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const order: number[] = [];
  const painting = paintReviewCutDissolve(
    target,
    scratch,
    0.5,
    async (_context, _canvas, side) => {
      order.push(side);
      if (side === 0) await held;
    },
    canvas
  );
  expect(order).toEqual([0]);
  expect(target.drawImage).not.toHaveBeenCalled();
  finish();
  await painting;
  expect(order).toEqual([0, 1]);
  expect(target.drawImage).toHaveBeenCalledOnce();
  vi.mocked(target.drawImage).mockClear();
  await expect(
    paintReviewCutDissolve(
      target,
      scratch,
      0.5,
      async () => {
        throw new Error('side failed');
      },
      canvas
    )
  ).rejects.toThrow('side failed');
  expect(target.drawImage).not.toHaveBeenCalled();
});

it('rejects preceding excluded frames even when returned by the range decoder', async () => {
  const left = frame(1.9),
    excluded = frame(3.9),
    right = frame(4.1);
  const sink = {
    getSample: vi.fn(async (_time: number) => left),
    async *samples() {
      yield excluded;
      yield right;
    },
  };
  const owner = createReviewTransitionFrames(sink, new AbortController().signal);
  const result = await owner.load(plan);
  expect(result).toEqual({ left, right });
  expect(sink.getSample.mock.calls[0]![0]).toBeLessThan(2);
  expect(excluded.close).toHaveBeenCalledOnce();
  expect(left.close).not.toHaveBeenCalled();
  expect(await owner.load(plan)).toBe(result);
  owner.dispose();
  expect(left.close).toHaveBeenCalledOnce();
  expect(right.close).toHaveBeenCalledOnce();
});

it('refuses empty or excluded intervals and releases partially acquired frames', async () => {
  const bad = frame(2);
  const sink = {
    getSample: vi.fn(async (_time: number) => bad),
    async *samples() {
      yield frame(4);
    },
  };
  const owner = createReviewTransitionFrames(sink, new AbortController().signal);
  expect(await owner.load(plan)).toBeNull();
  expect(sink.getSample.mock.calls[0]![0]).toBeLessThan(2);
  expect(bad.close).toHaveBeenCalledOnce();
  owner.dispose();
  expect(isReviewTransitionFrame(NaN, plan.left)).toBe(false);
  expect(isReviewTransitionFrame(4, plan.right)).toBe(true);
  expect(isReviewTransitionFrame(6, plan.right)).toBe(false);
});

it('closes a late decoder result after disposal instead of publishing obsolete frames', async () => {
  let resolve!: (value: ReviewTransitionSample) => void;
  const decoded = new Promise<ReviewTransitionSample>((done) => {
    resolve = done;
  });
  const late = frame(1);
  const owner = createReviewTransitionFrames(
    {
      getSample: () => decoded,
      async *samples() {
        yield frame(4);
      },
    },
    new AbortController().signal
  );
  const loading = owner.load(plan);
  owner.dispose();
  resolve(late);
  await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
  expect(late.close).toHaveBeenCalledOnce();
});

it('uses permitted endpoints instead of painting a stale frame from the removed interval', () => {
  const calls: { time: number; alpha: number }[] = [];
  const context = {
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const raster = (timestamp: number) => ({
    ...frame(timestamp),
    draw: vi.fn(() => {
      calls.push({ time: timestamp, alpha: context.globalAlpha });
    }),
  });
  const left = raster(1.9),
    right = raster(4.1),
    excluded = raster(3);
  paintReviewCutTransition(
    context,
    { width: 10, height: 10 },
    reviewCutTransitionAt(2, [plan])!,
    { left, right },
    excluded
  );
  expect(excluded.draw).not.toHaveBeenCalled();
  expect(calls).toEqual([
    { time: 1.9, alpha: 1 },
    { time: 4.1, alpha: 0.5 },
  ]);
  expect(context.restore).toHaveBeenCalledOnce();
  calls.length = 0;
  paintReviewCutTransition(
    context,
    { width: 10, height: 10 },
    reviewCutTransitionAt(2, [{ ...plan, type: 'fade-black' }])!,
    { left, right },
    excluded
  );
  expect(calls).toEqual([{ time: 4.1, alpha: 1 }]);
  expect(context.globalAlpha).toBe(1);
});

it('releases the left sample when the right interval is empty or decoding fails', async () => {
  const left = frame(1.9);
  const owner = createReviewTransitionFrames(
    {
      getSample: async () => left,
      async *samples() {
        yield* [];
      },
    },
    new AbortController().signal
  );
  expect(await owner.load(plan)).toBeNull();
  expect(left.close).toHaveBeenCalledOnce();
  owner.dispose();
  const second = frame(1.9);
  const failed = createReviewTransitionFrames(
    {
      getSample: async () => second,
      async *samples() {
        yield await Promise.reject(new Error('decoder failed'));
      },
    },
    new AbortController().signal
  );
  await expect(failed.load(plan)).rejects.toThrow('decoder failed');
  expect(second.close).toHaveBeenCalledOnce();
  failed.dispose();
});

it('recovers the last retained VFR frame when packet lookup rounds onto the excluded boundary', async () => {
  const excluded = frame(2),
    earlier = frame(0.7),
    last = frame(1.83),
    right = frame(4.12);
  const owner = createReviewTransitionFrames(
    {
      getSample: async () => excluded,
      async *samples(start) {
        if (start === 0) {
          yield earlier;
          yield last;
        } else yield right;
      },
    },
    new AbortController().signal
  );
  expect(await owner.load(plan)).toEqual({ left: last, right });
  expect(excluded.close).toHaveBeenCalledOnce();
  expect(earlier.close).toHaveBeenCalledOnce();
  expect(last.close).not.toHaveBeenCalled();
  owner.dispose();
  expect(last.close).toHaveBeenCalledOnce();
  expect(right.close).toHaveBeenCalledOnce();
});

it('releases a cached pair when another cut takes ownership and rejects aborted acquisition', async () => {
  const first = [frame(1.9), frame(4)];
  const second = [frame(5.9), frame(8)];
  const controller = new AbortController();
  const owner = createReviewTransitionFrames(
    {
      getSample: async (time) => (time < 3 ? first[0]! : second[0]!),
      async *samples(start) {
        yield start < 5 ? first[1]! : second[1]!;
      },
    },
    controller.signal
  );
  await owner.load(plan);
  await owner.load({
    ...plan,
    id: 'second',
    left: { start: 4, end: 6 },
    right: { start: 8, end: 10 },
  });
  for (const sample of first) expect(sample.close).toHaveBeenCalledOnce();
  for (const sample of second) expect(sample.close).not.toHaveBeenCalled();
  controller.abort();
  await expect(owner.load(plan)).rejects.toMatchObject({ name: 'AbortError' });
  for (const sample of second) expect(sample.close).toHaveBeenCalledOnce();
  owner.dispose();
  for (const sample of [...first, ...second]) expect(sample.close).toHaveBeenCalledOnce();
});

it('keeps the admitted moving side undimmed for final scene blackout without borrowing the other side', () => {
  const fills: number[] = [];
  const context = {
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: () => fills.push(context.globalAlpha),
  } as unknown as CanvasRenderingContext2D;
  const left = frame(1.9),
    right = frame(4),
    moving = frame(1.75);
  const fade = { ...plan, type: 'fade-black' as const };
  paintReviewCutTransition(
    context,
    { width: 10, height: 10 },
    reviewCutTransitionAt(1.75, [fade])!,
    { left, right },
    moving
  );
  expect(moving.draw).toHaveBeenCalledOnce();
  expect(left.draw).not.toHaveBeenCalled();
  expect(right.draw).not.toHaveBeenCalled();
  expect(fills).toEqual([1]);
  fills.length = 0;
  paintReviewCutTransition(
    context,
    { width: 10, height: 10 },
    reviewCutTransitionAt(2.25, [fade])!,
    { left, right },
    frame(4.25)
  );
  expect(fills).toEqual([1]);
});

it('blacks out full output coordinates once, leaving dissolve untouched', () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  const size = { width: 1280, height: 800 };
  paintReviewCutBlackout(context, size, reviewCutTransitionAt(1.75, [plan]));
  expect(context.fillRect).not.toHaveBeenCalled();
  for (const [time, alpha] of [
    [1.75, 0.5],
    [2, 1],
    [2.25, 0.5],
  ]) {
    paintReviewCutBlackout(
      context,
      size,
      reviewCutTransitionAt(time!, [{ ...plan, type: 'fade-black' }])
    );
    expect(context.globalAlpha).toBe(alpha);
    expect(context.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
    expect(context.fillRect).toHaveBeenLastCalledWith(0, 0, 1280, 800);
  }
  expect(context.restore).toHaveBeenCalledTimes(3);
  expect(context.fillStyle).toBe('#000000');
  paintReviewCutBlackout(
    context,
    size,
    reviewCutTransitionAt(2, [{ ...plan, type: 'fade-black', color: '#abcdef' }])
  );
  expect(context.fillStyle).toBe('#abcdef');
});

it('retains decoded allocation metadata on the same bounded endpoint samples', async () => {
  const left = { ...frame(1.9), allocationSize: () => 1234 };
  const right = { ...frame(4.1), allocationSize: () => 5678 };
  const owner = createReviewTransitionFrames(
    {
      getSample: async () => left,
      async *samples() {
        yield right;
      },
    },
    new AbortController().signal
  );
  const loaded = await owner.load(plan);
  expect(loaded?.left.allocationSize?.()).toBe(1234);
  expect(loaded?.right.allocationSize?.()).toBe(5678);
  owner.dispose();
  expect(left.close).toHaveBeenCalledOnce();
  expect(right.close).toHaveBeenCalledOnce();
});

it('holds independent seam clocks in fragment exports and rejects a moving frame from the cut', () => {
  const endpoints = { left: frame(1.9), right: frame(4) };
  const blend = reviewCutTransitionAt(2.1, [plan])!;
  const sides = reviewCutTransitionSides(blend, endpoints, frame(3), 12.1, 10);
  expect(sides[0].sample).toBe(endpoints.left);
  expect(sides[0].resultTime).toBeLessThan(12);
  expect(sides[0].resultTime).toBeCloseTo(12, 12);
  expect(sides[1]).toEqual({ sample: endpoints.right, resultTime: 12.1 });
});

it('restores the dissolve compositor context and leaves source lifetime with the caller', () => {
  const target = {
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const canvas = { width: 640, height: 360 } as HTMLCanvasElement;
  const scratch = { canvas, context: target };
  const draw = vi.fn();
  paintReviewCutDissolve(target, scratch, 0.5, draw, canvas);
  expect(draw.mock.calls.map((call) => call[2])).toEqual([0, 1]);
  expect(target.drawImage).toHaveBeenCalledWith(canvas, 0, 0);
  expect(target.restore).toHaveBeenCalledOnce();
  vi.mocked(target.drawImage).mockImplementationOnce(() => {
    throw new Error('paint failed');
  });
  expect(() => paintReviewCutDissolve(target, scratch, 0.5, draw, canvas)).toThrow('paint failed');
  expect(target.restore).toHaveBeenCalledTimes(2);
});

it('decodes both adjoining freeze frames and keeps each decorated side on the result clock', async () => {
  const [heldPlan] = planReviewCutTransitions(10, [
    {
      id: 'cut',
      kind: 'cut',
      start: 4,
      end: 6,
      requestedStart: 4,
      requestedEnd: 6,
      transition: { type: 'dissolve', before: 0.5, after: 0.5 },
    },
    ...[4, 6].map((at) => ({
      id: `hold-${at}`,
      kind: 'freeze' as const,
      start: at,
      end: at,
      requestedStart: at,
      requestedEnd: at,
      duration: 1,
      frameTime: at - 0.04,
      frameDuration: 0.04,
    })),
  ]);
  const left = frame(3.96),
    right = frame(5.96);
  const sink = {
    getSample: vi.fn(async (time: number) => (time === 3.96 ? left : right)),
    async *samples() {
      yield frame(6.04);
    },
  };
  const owner = createReviewTransitionFrames(sink, new AbortController().signal);
  try {
    const endpoints = await owner.load(heldPlan!);
    expect(endpoints).toEqual({ left, right });
    expect(sink.getSample.mock.calls).toEqual([[3.96], [5.96]]);
    for (const time of [heldPlan!.seam - 0.25, heldPlan!.seam + 0.25]) {
      const blend = reviewCutTransitionAt(time, [heldPlan!])!;
      const sides = reviewCutTransitionSides(blend, endpoints!, frame(6.04), time);
      expect(sides.map((side) => side.sample)).toEqual([left, right]);
      expect(sides[blend.beforeSeam ? 0 : 1].resultTime).toBe(time);
    }
  } finally {
    owner.dispose();
  }
  expect(left.close).toHaveBeenCalledOnce();
  expect(right.close).toHaveBeenCalledOnce();
});

it('keeps each CUT transition side on its authored visual phase', () => {
  const original = buildReviewTimeMap(6, []);
  const edits = [
    { id: 'cut', kind: 'cut' as const, start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
  ];
  const map = buildReviewTimeMap(6, edits);
  const range = { start: 1, end: 5, timeDomain: 'result' as const };
  const motion: CursorMotion = {
    ...range,
    id: 'cursor',
    enabled: true,
    shape: 'arrow',
    size: 48,
    color: '#000000',
    outline: '#ffffff',
    shadow: true,
    easing: 'linear',
    points: [
      { id: 'a', at: 0, x: 0, y: 0 },
      { id: 'b', at: 1, x: 1, y: 1 },
    ],
  };
  const motions = projectReviewCursorMotions([anchorReviewVisual(motion, original)], map);
  const focus = projectReviewFocus(
    [
      anchorReviewVisual(
        {
          ...createQuickEditZoomRegion({ id: 'focus', at: 1, duration: 4 }),
          ...range,
        },
        original
      ),
    ],
    map
  );
  const annotation = projectReviewAnnotationEffect(anchorReviewVisual(range, original), map);
  expect(focus.map((slice) => [slice.start, slice.end, slice.phaseClock?.offset])).toEqual([
    [1, 2, 0],
    [2, 3, 3],
  ]);
  const blend = reviewCutTransitionAt(1.75, [plan])!;
  const sides = reviewCutTransitionSides(
    blend,
    { left: frame(1.9), right: frame(4) },
    frame(1.75),
    1.75
  );
  expect(sides.map((side) => side.sample.timestamp)).toEqual([1.75, 4]);
  for (const [index, side] of sides.entries()) {
    const expected = index === 0 ? 0.1875 : 0.75;
    expect(evaluateCursorMotion(motions, side.sample.timestamp, side.resultTime)?.x).toBeCloseTo(
      expected,
      8
    );
    expect(sampleReviewAnnotationEffect(annotation, 1, side.resultTime)?.progress).toBeCloseTo(
      expected,
      8
    );
  }
});
