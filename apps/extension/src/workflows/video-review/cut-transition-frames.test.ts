import { reviewCutTransitionAt } from '../../features/video/review/cuts';
import { expect, it, vi } from 'vitest';
import {
  createReviewTransitionFrames,
  isReviewTransitionFrame,
  paintReviewCutTransition,
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

it('fades the admitted moving side to black and restores it without borrowing the other side', () => {
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
  expect(fills).toEqual([1, 0.5]);
  fills.length = 0;
  paintReviewCutTransition(
    context,
    { width: 10, height: 10 },
    reviewCutTransitionAt(2.25, [fade])!,
    { left, right },
    frame(4.25)
  );
  expect(fills).toEqual([1, 0.5]);
});
