import { expect, it } from 'vitest';
import { createTourDocument, createTourImageSlide } from '../project/factories';
import {
  tourAutoplayDestination,
  tourLinearTimeline,
  tourSlideDuration,
  tourEntranceTiming,
  tourHighlightTiming,
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
  image.actions = [
    ...image.actions.filter((entry) => entry.type !== 'annotation'),
    ...[{ id: 'note', text: 'x'.repeat(150), anchor: null, appearance: null }].map((object) => ({
      type: 'annotation' as const,
      object,
    })),
  ];
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
  'waits at contents regardless of authored controls %j',
  (actions) => {
    const { tour } = fixture(actions);
    expect(tourAutoplayDestination(tour, 0)).toBeNull();
  }
);
it('keeps a truthful timeline across contents and explicit looping', () => {
  const { tour } = fixture([{ kind: 'url', url: 'https://example.com' }]);
  expect(tourAutoplayDestination(tour, 0)).toBeNull();
  expect(tourAutoplayDestination(tour, 1)).toBe(2);
  expect(tourAutoplayDestination(tour, 20)).toBeNull();
  expect(tourLinearTimeline(tour)).toEqual({ offsets: [0, 4000, 8000], duration: 12000 });
  tour.playback.loop = true;
  expect(tourLinearTimeline(tour)?.duration).toBe(12000);
  tour.slides = [];
  expect(tourLinearTimeline(tour)).toBeNull();
});

it('counts destination entrance separately and removes it for reduced motion', () => {
  const { tour, slide } = fixture();
  tour.transition = { kind: 'fade', durationMs: 200, hotspotTravelMs: 300 };
  expect(tourEntranceTiming(tour, slide)).toMatchObject({ switchMs: 200, travelMs: 0, total: 200 });
  const image = tour.slides[1]!;
  if (image.kind !== 'image') throw new Error('Expected image');
  image.actions = [
    ...image.actions.filter((entry) => entry.type !== 'hotspot'),
    ...[
      {
        id: 'point',
        point: { x: 0.5, y: 0.5 },
        targetRect: null,
        label: '',
        text: '',
        appearance: null,
        visual: { kind: 'point' as const, pulse: true },
      },
    ].map((object) => ({ type: 'hotspot' as const, object })),
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
      narration: { ...voice, trigger: 'enter' as const },
    },
  ];
  expect(tourSlideDuration(tour, slide)).toBe(10000);
  slide.buttons[0]!.narration!.trigger = 'activation';
  expect(tourSlideDuration(tour, slide)).toBe(5000);
});

it('adds highlight phase budgets without shortening hold or animating other mask kinds', () => {
  const { tour } = fixture();
  const slide = createTourImageSlide('highlight');
  const animation = {
    enter: { kind: 'fade' as const, durationMs: 400 },
    exit: { kind: 'fade' as const, durationMs: 200 },
  };
  slide.masks = [
    {
      id: 'mask',
      kind: 'highlight',
      rect: { x: 0, y: 0, width: 1, height: 1 },
      opacity: 0.5,
      color: '#ffffff',
      highlightAnimation: animation,
    },
  ];
  tour.slides = [slide];
  expect(tourHighlightTiming(tour, slide)).toEqual({ enterMs: 400, exitMs: 200 });
  expect(tourEntranceTiming(tour, slide).total).toBe(400);
  expect(tourLinearTimeline(tour)!.duration).toBe(tourSlideDuration(tour, slide) + 600);
  expect(tourHighlightTiming(tour, slide, true)).toEqual({ enterMs: 0, exitMs: 0 });
  slide.masks[0]!.kind = 'redact';
  expect(tourHighlightTiming(tour, slide)).toEqual({ enterMs: 0, exitMs: 0 });
});
