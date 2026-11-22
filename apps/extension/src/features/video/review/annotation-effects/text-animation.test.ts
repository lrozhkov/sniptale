import { expect, it } from 'vitest';
import {
  createReviewAnnotationTextClip,
  sampleReviewAnnotationText,
  sampleReviewTextReveal,
} from './text-animation';

it('keeps static text on the half-open result interval with the loop off', () => {
  const clip = createReviewAnnotationTextClip('title', 'Заголовок', 5, 8, 0);
  expect(clip.loop.preset).toBe('none');
  expect(sampleReviewAnnotationText(clip, 4.999)).toBeNull();
  expect(sampleReviewAnnotationText(clip, 5)).toMatchObject({
    motion: { x: 0, y: 0, opacity: 1 },
    reveal: null,
  });
  expect(sampleReviewAnnotationText(clip, 7.999)).toEqual(sampleReviewAnnotationText(clip, 5));
  expect(sampleReviewAnnotationText(clip, 8)).toBeNull();
});

it('fits short reveal phases proportionally while reserving time for all text', () => {
  const clip = createReviewAnnotationTextClip('title', 'А Б В', 0, 0.5, 0);
  clip.entrance = { ...clip.entrance, preset: 'typewriter', duration: 2 };
  clip.exit = { ...clip.exit, preset: 'fade', duration: 1 };
  const revealing = sampleReviewAnnotationText(clip, 0.1)?.reveal;
  expect(revealing?.progress).toBeCloseTo(0.375);
  expect(sampleReviewTextReveal(revealing!, 0, 3).opacity).toBe(1);
  expect(sampleReviewTextReveal(revealing!, 1, 3).opacity).toBe(0);
  expect(sampleReviewAnnotationText(clip, 0.31)).toMatchObject({
    motion: { opacity: 1 },
    reveal: null,
  });
  expect(sampleReviewAnnotationText(clip, 0.45)?.motion.opacity).toBeCloseTo(0.375);
  expect(clip.entrance.duration).toBe(2);
  expect(clip.exit.duration).toBe(1);
  const restored = { ...clip, end: 4 };
  expect(sampleReviewAnnotationText(restored, 1)?.reveal?.progress).toBe(0.5);
});

it('continues the loop endpoint into the exit and keeps the period when extending the clip', () => {
  const clip = createReviewAnnotationTextClip('title', 'Sway', 0, 3.5, 0);
  clip.loop = { preset: 'sway', amount: 1, period: 2 };
  clip.exit = { ...clip.exit, preset: 'fade', duration: 1 };
  const holding = sampleReviewAnnotationText(clip, 2.5 - 0.000001)!.motion;
  const ending = sampleReviewAnnotationText(clip, 2.5)!.motion;
  expect(ending.x).toBeCloseTo(0.08, 9);
  expect(ending.rotation).toBeCloseTo(0.2, 9);
  expect(ending.x).toBeCloseTo(holding.x, 6);
  expect(ending.rotation).toBeCloseTo(holding.rotation, 6);
  expect(sampleReviewAnnotationText(clip, 3)?.motion.x).toBeCloseTo(0.04);
  expect(sampleReviewAnnotationText({ ...clip, end: 6 }, 2)).toEqual(
    sampleReviewAnnotationText(clip, 2)
  );
  expect(sampleReviewAnnotationText(clip, 2.5)?.motion).toEqual(ending);
});

it('samples zero-duration phases and a hold-free clip without dropping its first frame', () => {
  const clip = createReviewAnnotationTextClip('title', 'Text', 0, 1, 0);
  clip.entrance = { ...clip.entrance, preset: 'fade', duration: 0 };
  clip.exit = { ...clip.exit, preset: 'fade', duration: 3 };
  clip.loop = { preset: 'shine', period: 0.5, amount: 1 };
  expect(sampleReviewAnnotationText(clip, 0)?.motion).toMatchObject({ opacity: 1, shine: 0 });
  expect(sampleReviewAnnotationText(clip, 0.5)?.motion).toMatchObject({ opacity: 0.5, shine: 0 });
});

it.each(['fade', 'pop', 'zoom', 'bounce', 'wipe', 'tracking', 'blur', 'rise', 'squeeze'] as const)(
  'starts and ends %s from a well-defined visible hold state',
  (preset) => {
    const clip = createReviewAnnotationTextClip('title', 'Motion', 1, 4, 0);
    clip.entrance = { ...clip.entrance, preset, duration: 0.5 };
    clip.exit = { ...clip.exit, preset, duration: 0.5 };
    const hold = sampleReviewAnnotationText(clip, 2)!.motion;
    const start = sampleReviewAnnotationText(clip, 1)!.motion;
    const late = sampleReviewAnnotationText(clip, 3.99)!.motion;
    expect(start).not.toEqual(hold);
    expect(late).not.toEqual(hold);
    expect(sampleReviewAnnotationText(clip, 3.5)?.motion).toEqual(hold);
  }
);

it.each([
  ['left', 1, 0],
  ['right', -1, 0],
  ['up', 0, 1],
  ['down', 0, -1],
] as const)('evaluates the opposing displacement for a slide %s', (direction, x, y) => {
  const clip = createReviewAnnotationTextClip('title', 'Slide', 0, 2, 0);
  clip.entrance = { ...clip.entrance, preset: 'slide', direction, distance: 0.25 };
  expect(sampleReviewAnnotationText(clip, 0)?.motion).toMatchObject({
    x: x * 0.25,
    y: y * 0.25,
    opacity: 0,
  });
});

it.each(['shine', 'pulse', 'sway', 'float', 'breathe', 'flicker'] as const)(
  'starts %s at rest and repeats at the authored period without altering the clip',
  (preset) => {
    const clip = createReviewAnnotationTextClip('title', 'Hold', 0, 6, 0);
    const still = sampleReviewAnnotationText(clip, 0)!.motion;
    clip.loop = { preset, period: 2, amount: 1 };
    const origin = sampleReviewAnnotationText(clip, 0)!.motion;
    expect(Object.values(origin).map((value) => value + 0)).toEqual(Object.values(still));
    const active = sampleReviewAnnotationText(clip, 0.125);
    expect(active?.motion).not.toEqual(still);
    expect(sampleReviewAnnotationText(clip, 2.125)).toEqual(active);
    expect(sampleReviewAnnotationText({ ...clip, enabled: false }, 0.125)).toBeNull();
  }
);

it('cascades words in place on entrance and reverses the stagger on exit', () => {
  const clip = createReviewAnnotationTextClip('title', 'First and last', 0, 3, 0);
  clip.entrance = { ...clip.entrance, preset: 'cascade', duration: 1, stagger: 1 };
  clip.exit = { ...clip.exit, preset: 'cascade', duration: 1, stagger: 1 };
  const entrance = sampleReviewAnnotationText(clip, 0.4)!.reveal!;
  const exit = sampleReviewAnnotationText(clip, 2.6)!.reveal!;
  const hidden = sampleReviewTextReveal(entrance, 2, 3);
  expect(hidden).toMatchObject({ opacity: 0, y: clip.entrance.distance });
  expect(hidden.blur).toBeGreaterThan(0);
  expect(sampleReviewTextReveal(entrance, 0, 3)).toEqual({ opacity: 1, y: 0, blur: 0 });
  expect(sampleReviewTextReveal(exit, 0, 3)).toEqual(hidden);
  expect(sampleReviewTextReveal(exit, 2, 3)).toEqual({ opacity: 1, y: 0, blur: 0 });
  expect(sampleReviewTextReveal(entrance, 0, 1)).toMatchObject({ opacity: 1 });
});
