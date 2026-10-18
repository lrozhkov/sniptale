import { expect, it } from 'vitest';
import { createTourDocument, createTourImageSlide } from './factories';
import { buildTourPlaybackPlan, getTourActionTitle } from './tour-playback-plan';

function example() {
  const tour = createTourDocument('tour');
  tour.slides = [0, 1, 2].map((index) => {
    const slide = createTourImageSlide(`slide-${index}`);
    slide.actions = [0, 1, 2].map((action) => ({
      type: 'annotation' as const,
      object: {
        id: `action-${index}-${action}`,
        text: `Action ${index * 3 + action + 1}`,
        anchor: null,
        appearance: null,
      },
    }));
    return slide;
  });
  return tour;
}

it('flattens three slides into nine numbered actions without cloning images', () => {
  const tour = example();
  const plan = buildTourPlaybackPlan(tour);
  expect(plan.actionCount).toBe(9);
  expect(plan.entries.map((entry) => entry.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(plan.entries.map((entry) => entry.actionId)).toEqual(
    tour.slides.flatMap((slide) =>
      slide.kind === 'image' ? slide.actions.map((entry) => entry.object.id) : []
    )
  );
  expect(plan.entries[0]?.slide.kind === 'image' && plan.entries[0].slide.image).toBe(
    tour.slides[0]?.kind === 'image' ? tour.slides[0].image : undefined
  );
  expect(tour.slides).toHaveLength(3);
});

it('keeps contents entries without consuming action numbers', () => {
  const tour = example();
  tour.slides.splice(1, 0, {
    kind: 'navigation',
    id: 'contents',
    title: 'Contents',
    description: '',
    background: { color: '#ffffff', image: null },
    buttons: [],
    narration: null,
    timing: createTourImageSlide().timing,
  });
  const plan = buildTourPlaybackPlan(tour);
  expect(plan.actionCount).toBe(9);
  expect(plan.entries.map((entry) => entry.ordinal)).toEqual([1, 2, 3, null, 4, 5, 6, 7, 8, 9]);
  expect(plan.entries[3]).toMatchObject({
    key: 'contents',
    sourceSlideId: 'contents',
    actionId: null,
  });
});

it('keeps stable targets after slide and action reorder', () => {
  const tour = example();
  const first = tour.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image slide.');
  first.actions.reverse();
  tour.slides.reverse();
  const plan = buildTourPlaybackPlan(tour);
  expect(plan.entries.find((entry) => entry.actionId === 'action-0-2')).toMatchObject({
    key: 'action-0-2',
    ordinal: 7,
    sourceSlideId: 'slide-0',
  });
});

it('skips empty image containers and represents completely empty tours', () => {
  const tour = example();
  const first = tour.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image slide.');
  first.actions = [];
  const plan = buildTourPlaybackPlan(tour);
  expect(plan.actionCount).toBe(6);
  expect(plan.entries[0]?.actionId).toBe('action-1-0');
  tour.slides = [];
  expect(buildTourPlaybackPlan(tour)).toEqual({ entries: [], actionCount: 0 });
});

it('projects only one action and its overrides while retaining permanent image effects', () => {
  const tour = example();
  const slide = tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image slide.');
  const action = slide.actions[1]!;
  action.object.timing = { ...slide.timing, mode: 'manual', holdSeconds: 12 };
  action.object.camera = { ...slide.camera, mode: 'off' };
  slide.masks = [
    {
      id: 'private',
      kind: 'redact',
      rect: { x: 0, y: 0, width: 0.2, height: 0.1 },
      color: '#111827',
      opacity: 1,
    },
  ];
  const entry = buildTourPlaybackPlan(tour).entries[1]!;
  expect(entry.slide).toMatchObject({
    id: slide.id,
    timing: { mode: 'manual', holdSeconds: 12 },
    camera: { mode: 'off' },
    masks: slide.masks,
  });
  expect(entry.slide.kind === 'image' && entry.slide.actions).toEqual([action]);
  expect(slide.actions).toHaveLength(3);
});

it('keeps beginning, consecutive and ending contents as distinct unnumbered entries', () => {
  const tour = example();
  const timing = createTourImageSlide().timing;
  const contents = (id: string) => ({
    kind: 'navigation' as const,
    id,
    title: id,
    description: '',
    background: { color: '#ffffff', image: null },
    buttons: [],
    narration: null,
    timing,
  });
  tour.slides = [
    contents('begin'),
    tour.slides[0]!,
    contents('middle-one'),
    contents('middle-two'),
    tour.slides[1]!,
    contents('end'),
  ];
  const plan = buildTourPlaybackPlan(tour);
  expect(plan.entries.map((entry) => [entry.key, entry.ordinal])).toEqual([
    ['begin', null],
    ['action-0-0', 1],
    ['action-0-1', 2],
    ['action-0-2', 3],
    ['middle-one', null],
    ['middle-two', null],
    ['action-1-0', 4],
    ['action-1-1', 5],
    ['action-1-2', 6],
    ['end', null],
  ]);
  expect(plan.actionCount).toBe(6);
});

it('projects the first nonempty authored text line before the saved hotspot label', () => {
  const tour = example();
  const slide = tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image slide.');
  slide.actions = [
    {
      type: 'hotspot',
      object: {
        id: 'text-first',
        text: ' \n Authored title \nSecond line',
        label: 'Saved label',
        point: { x: 0.5, y: 0.5 },
        targetRect: null,
        appearance: null,
        visual: { kind: 'point', pulse: false },
      },
    },
  ];
  expect(buildTourPlaybackPlan(tour).entries[0]?.slide.title).toBe('Authored title');
  expect(slide.actions[0]!.object).toMatchObject({ label: 'Saved label' });
});

it('uses saved labels and localized generic copy only when authored text is empty', () => {
  expect(getTourActionTitle({ text: ' \n ', label: ' Saved label ' }, 'Hotspot')).toBe(
    'Saved label'
  );
  expect(getTourActionTitle({ text: ' \n ', label: ' ' }, 'Hotspot')).toBe('Hotspot');
  expect(getTourActionTitle({ text: '' }, 'Annotation')).toBe('Annotation');
});
