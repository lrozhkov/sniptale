import { expect, it } from 'vitest';
import { createTourDocument, createTourImageSlide } from '../project/factories';
import {
  tourAutoplayDestination,
  tourLinearTimeline,
  tourSlideDuration,
  tourEntranceTiming,
} from './timing';
import type {
  TourAction,
  TourNavigationSlide,
} from '@sniptale/runtime-contracts/scenario/types/tour';
function fixture(actions: TourAction[] = []) {
  const tour = createTourDocument('tour');
  tour.transition = { kind: 'none', durationMs: 0, hotspotTravelMs: 0 };
  const slide: TourNavigationSlide = {
    kind: 'navigation',
    id: 'first',
    title: '',
    description: '',
    background: { color: '#000000', image: null },
    buttons: [],
    narration: null,
    timing: createTourImageSlide('timing').timing,
  };
  slide.buttons = actions.map((action, index) => ({ id: String(index), label: '', action }));
  tour.slides = [slide, createTourImageSlide('second'), createTourImageSlide('third')];
  return { tour, slide };
}
it('uses text and trimmed narration, preserving narration unless truncation is explicit', () => {
  const { tour, slide } = fixture();
  expect(tourSlideDuration(tour, slide)).toBe(4000);
  slide.description = 'x'.repeat(150);
  expect(tourSlideDuration(tour, slide)).toBe(11000);
  slide.narration = {
    assetId: 'audio',
    duration: 30,
    trimStart: 5,
    trimEnd: 25,
    gain: 1,
    transcript: '',
  };
  expect(tourSlideDuration(tour, slide)).toBe(20000);
  slide.timing.mode = 'manual';
  slide.timing.holdSeconds = 3;
  expect(tourSlideDuration(tour, slide)).toBe(20000);
  slide.timing.truncateNarration = true;
  expect(tourSlideDuration(tour, slide)).toBe(3000);
  const image = tour.slides[1]!;
  if (image.kind !== 'image') throw new Error('image expected');
  image.annotations = [{ id: 'note', text: 'x'.repeat(150), anchor: null, appearance: null }];
  expect(tourSlideDuration(tour, image)).toBe(11000);
});
it.each([
  [[], 1],
  [[{ kind: 'none' }], 1],
  [[{ kind: 'next' }, { kind: 'next' }], 1],
  [[{ kind: 'slide', slideId: 'third' }], 2],
  [[{ kind: 'restart' }], 0],
  [[{ kind: 'end' }], 3],
  [[{ kind: 'previous' }], null],
  [[{ kind: 'url', url: 'https://example.com' }], null],
  [[{ kind: 'next' }, { kind: 'end' }], null],
  [[{ kind: 'slide', slideId: 'missing' }], null],
] as [TourAction[], number | null][])(
  'resolves only an unambiguous internal route %j',
  (actions, target) => {
    const { tour } = fixture(actions);
    expect(tourAutoplayDestination(tour, 0)).toBe(target);
  }
);
it('prioritizes a declared autoplay target without running URL actions', () => {
  const { tour, slide } = fixture([{ kind: 'url', url: 'https://example.com' }]);
  slide.timing.autoplayTarget = 'second';
  expect(tourAutoplayDestination(tour, 0)).toBe(1);
  slide.timing.autoplayTarget = 'missing';
  expect(tourAutoplayDestination(tour, 0)).toBeNull();
  expect(tourAutoplayDestination(tour, 20)).toBeNull();
});
it('exposes total time only for a non-looping structural route', () => {
  const { tour, slide } = fixture();
  expect(tourLinearTimeline(tour)).toEqual({ offsets: [0, 4000, 8000], duration: 12000 });
  slide.timing.autoplayTarget = 'third';
  expect(tourLinearTimeline(tour)).toBeNull();
  slide.timing.autoplayTarget = null;
  tour.playback.loop = true;
  expect(tourLinearTimeline(tour)).toBeNull();
  tour.slides = [];
  expect(tourLinearTimeline(tour)).toBeNull();
});

it('keeps a branching tour local even when its autoplay default follows physical order', () => {
  const { tour, slide } = fixture([
    { kind: 'slide', slideId: 'second' },
    { kind: 'slide', slideId: 'third' },
  ]);
  slide.timing.autoplayTarget = 'second';
  expect(tourAutoplayDestination(tour, 0)).toBe(1);
  expect(tourLinearTimeline(tour)).toBeNull();
  slide.buttons = [{ id: 'url', label: '', action: { kind: 'url', url: 'https://example.com' } }];
  expect(tourLinearTimeline(tour)).toBeNull();
  slide.buttons = [
    { id: 'next', label: '', action: { kind: 'next' } },
    { id: 'none', label: '', action: { kind: 'none' } },
  ];
  expect(tourLinearTimeline(tour)).not.toBeNull();
});

it('counts destination entrance separately and removes it for reduced motion', () => {
  const { tour, slide } = fixture();
  tour.transition = { kind: 'fade', durationMs: 200, hotspotTravelMs: 300 };
  expect(tourEntranceTiming(tour, slide)).toMatchObject({ switchMs: 200, travelMs: 0, total: 200 });
  const image = tour.slides[1]!;
  if (image.kind !== 'image') throw new Error('Expected image');
  image.hotspots = [
    {
      id: 'point',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      label: '',
      text: '',
      action: { kind: 'none' },
      appearance: null,
      pulse: true,
    },
  ];
  expect(tourEntranceTiming(tour, image).total).toBe(500);
  expect(tourLinearTimeline(tour)?.duration).toBe(12900);
  expect(tourLinearTimeline(tour, true)?.duration).toBe(12000);
  expect(tourEntranceTiming(tour, image, true).total).toBe(0);
  tour.transition.kind = 'none';
  expect(tourEntranceTiming(tour, image).total).toBe(300);
});

it('budgets all sequential entry narration while activation cues remain gesture-driven', () => {
  const { tour, slide } = fixture();
  const voice = {
    assetId: 'voice',
    duration: 10,
    trimStart: 1,
    trimEnd: 6,
    gain: 1,
    transcript: '',
  };
  slide.narration = voice;
  slide.buttons = [
    {
      id: 'spoken',
      label: '',
      action: { kind: 'none' },
      narration: { ...voice, trigger: 'enter' },
    },
  ];
  expect(tourSlideDuration(tour, slide)).toBe(10000);
  slide.buttons[0]!.narration!.trigger = 'activation';
  expect(tourSlideDuration(tour, slide)).toBe(5000);
});
