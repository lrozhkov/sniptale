import {
  getTourHotspots,
  getTourAnnotations,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { createTourBackgroundMusic } from '@sniptale/runtime-contracts/scenario/types/tour';
import { expect, it } from 'vitest';
import {
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
} from './factories';
import {
  getTourImages,
  getScenarioResourceReferences,
  remapTourIdentities,
} from './tour-resources';
import { parseTourDocument } from '@sniptale/runtime-contracts/scenario/tour-parser';

it('retains shared guide images, tour backgrounds, annotation documents and audio', () => {
  const project = createGuideProject('Guide', 'project');
  const step = createGuideStep('', 'step');
  step.blocks = [
    createGuideImageBlock({
      id: 'block',
      assetId: 'image',
      width: 100,
      height: 80,
      editDocumentId: 'edit',
      source: { kind: 'import', filename: 'one.png' },
    }),
  ];
  project.items = [step];
  project.tour = createTourDocument('tour');
  const slide = createTourImageSlide('slide');
  slide.image = {
    assetId: 'image',
    galleryAssetId: null,
    editDocumentId: 'edit',
    width: 100,
    height: 80,
    alt: '',
    source: { kind: 'import', filename: 'one.png' },
  };
  slide.actions.unshift({
    type: 'annotation' as const,
    object: {
      id: slide.id + '-voice',
      text: '',
      anchor: null,
      appearance: null,
      narration: {
        ...{
          assetId: 'audio',
          duration: 3,
          trimStart: 0,
          trimEnd: 3,
          gain: 1,
          transcript: '',
        },
        trigger: 'enter' as const,
      },
    },
  });
  project.tour.slides = [
    slide,
    {
      kind: 'navigation',
      id: 'menu',
      title: '',
      description: '',
      background: { color: '#ffffff', image: { ...slide.image, assetId: 'background' } },
      buttons: [],
      narration: null,
      timing: slide.timing,
    },
  ];
  expect([...getScenarioResourceReferences(project).assets]).toEqual([
    'image',
    'background',
    'audio',
  ]);
  expect([...getScenarioResourceReferences(project).documents]).toEqual(['edit']);
});

it('remaps all authored IDs and destinations while preserving source evidence', () => {
  const tour = createTourDocument('tour');
  const first = createTourImageSlide('first');
  const second = createTourImageSlide('second');
  first.origin = { stepId: 'step', blockId: 'block' };
  first.actions = [
    ...first.actions.filter((entry) => entry.type !== 'hotspot'),
    ...[
      {
        id: 'hotspot',
        point: { x: 0.5, y: 0.5 },
        targetRect: null,
        label: 'next',
        text: '',
        appearance: null,
        visual: { kind: 'point' as const, pulse: true },
      },
    ].map((object) => ({ type: 'hotspot' as const, object })),
  ];
  tour.slides = [first, second];
  let index = 0;
  remapTourIdentities(
    tour,
    () => `new-${++index}`,
    new Map([
      ['step', 'new-step'],
      ['block', 'new-block'],
    ])
  );
  expect(first.origin).toEqual({ stepId: 'new-step', blockId: 'new-block' });
  expect(getTourHotspots(first)[0]?.visual).toEqual({ kind: 'point', pulse: true });
  expect(parseTourDocument(tour).status).toBe('ok');
});

it('retains detached audio materials and audio bound only to objects', () => {
  const project = createGuideProject('Audio', 'project');
  const slide = createTourImageSlide('slide');
  const voice = {
    assetId: 'object-audio',
    duration: 2,
    trimStart: 0,
    trimEnd: 2,
    gain: 1,
    transcript: '',
    trigger: 'activation' as const,
  };
  project.tour = {
    ...createTourDocument('tour'),
    audioResources: [{ assetId: 'detached', duration: 2, name: 'Take.wav' }],
    slides: [
      {
        ...slide,
        actions: [
          {
            type: 'annotation' as const,
            object: { id: 'hint', text: 'hint', anchor: null, appearance: null, narration: voice },
          },
        ],
      },
    ],
  };
  expect([...getScenarioResourceReferences(project).assets]).toEqual(['detached', 'object-audio']);
});

it('orders narration targets by the stored mixed object order', async () => {
  const { getTourNarrationTargets } = await import('./tour-resources');
  const slide = createTourImageSlide('slide');
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'hotspot'),
    ...[
      {
        id: 'point',
        point: { x: 0.5, y: 0.5 },
        targetRect: null,
        label: 'Point',
        text: '',
        appearance: null,
        visual: { kind: 'point' as const, pulse: false },
      },
    ].map((object) => ({ type: 'hotspot' as const, object })),
  ];
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'annotation'),
    ...[{ id: 'note', text: 'Note', anchor: null, appearance: null }].map((object) => ({
      type: 'annotation' as const,
      object,
    })),
  ];
  slide.masks = [
    {
      id: 'mask',
      rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      kind: 'highlight',
      color: '#f97316',
      opacity: 0.3,
    },
  ];
  const ids = (value: typeof slide) =>
    getTourNarrationTargets(value).map((target) => ('id' in target ? target.id : null));
  expect(ids(slide)).toEqual(['point', 'note']);
  slide.actions.sort(
    (left, right) =>
      ['mask', 'note', 'point'].indexOf(left.object.id) -
      ['mask', 'note', 'point'].indexOf(right.object.id)
  );
  expect(ids(slide)).toEqual(['note', 'point']);
});

it('remaps stored object order ids together with object identities', () => {
  const tour = createTourDocument('tour');
  const slide = createTourImageSlide('first');
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'hotspot'),
    ...[
      {
        id: 'point',
        point: { x: 0.5, y: 0.5 },
        targetRect: null,
        label: 'Point',
        text: '',
        appearance: null,
        visual: { kind: 'point' as const, pulse: false },
      },
    ].map((object) => ({ type: 'hotspot' as const, object })),
  ];
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'annotation'),
    ...[{ id: 'note', text: 'Note', anchor: null, appearance: null }].map((object) => ({
      type: 'annotation' as const,
      object,
    })),
  ];
  slide.actions.sort(
    (left, right) =>
      ['note', 'point'].indexOf(left.object.id) - ['note', 'point'].indexOf(right.object.id)
  );
  tour.slides = [slide];
  let index = 0;
  remapTourIdentities(tour, () => `new-${++index}`, new Map());
  expect(slide.actions.map((entry) => entry.object.id)).toEqual(['new-3', 'new-4']);
  expect(getTourHotspots(slide)[0]?.id).toBe('new-4');
  expect(getTourAnnotations(slide)[0]?.id).toBe('new-3');
  expect(parseTourDocument(tour).status).toBe('ok');
});

it('projects ordered entry cues and only the explicitly activated object', async () => {
  const { getTourNarrationCues } = await import('./tour-resources');
  const slide = createTourImageSlide('slide');
  const narration = {
    assetId: 'voice',
    duration: 2,
    trimStart: 0,
    trimEnd: 2,
    gain: 1,
    transcript: '',
  };
  slide.actions.unshift({
    type: 'annotation' as const,
    object: {
      id: slide.id + '-voice',
      text: '',
      anchor: null,
      appearance: null,
      narration: { ...narration, trigger: 'enter' as const },
    },
  });
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'annotation'),
    ...[
      {
        id: 'intro',
        text: 'Intro',
        anchor: null,
        appearance: null,
        narration: { ...narration, trigger: 'enter' as const },
      },
      {
        id: 'detail',
        text: 'Detail',
        anchor: null,
        appearance: null,
        narration: { ...narration, trigger: 'activation' as const },
      },
      { id: 'silent', text: 'Silent', anchor: null, appearance: null },
    ].map((object) => ({ type: 'annotation' as const, object })),
  ];
  expect(getTourNarrationCues(slide, { kind: 'enter' }).map((c) => c.objectId)).toEqual([
    'intro',
    'detail',
  ]);
  expect(
    getTourNarrationCues(slide, { kind: 'activation', objectId: 'detail' }).map((c) => c.objectId)
  ).toEqual([]);
  expect(getTourNarrationCues(slide, { kind: 'activation', objectId: 'missing' })).toEqual([]);
});

it('includes the mutable stage occurrence and retains shared slide references independently', () => {
  const project = createGuideProject('Project');
  const tour = (project.tour = createTourDocument());
  const slide = createTourImageSlide();
  const image = {
    assetId: 'shared',
    editDocumentId: 'edit',
    galleryAssetId: null,
    width: 10,
    height: 10,
    alt: '',
    source: { kind: 'import' as const, filename: 'a.png' },
  };
  tour.stage.image = { ...image };
  slide.image = { ...image };
  tour.slides = [slide];
  expect(getTourImages(tour)).toHaveLength(2);
  expect(getTourImages(tour)).toContain(tour.stage.image);
  expect(getTourImages(tour).find((entry) => entry === tour.stage.image)).toBe(tour.stage.image);
  tour.stage.image = null;
  expect([...getScenarioResourceReferences(project).assets]).toEqual(['shared']);
  expect([...getScenarioResourceReferences(project).documents]).toEqual(['edit']);
  tour.stage.image = { ...image, assetId: 'stage-only' };
  expect(getScenarioResourceReferences(project).assets.has('stage-only')).toBe(true);
});

it('retains a music-only asset without materializing a resource catalog on read', () => {
  const project = createGuideProject('Music');
  project.tour = createTourDocument();
  project.tour.backgroundMusic = createTourBackgroundMusic({ assetId: 'music', duration: 4 });
  expect([...getScenarioResourceReferences(project).assets]).toEqual(['music']);
  expect(project.tour.audioResources).toBeUndefined();
});

it('preserves diagnosable orphan action destinations while remapping surviving action links', () => {
  const slide = createTourImageSlide('image');
  slide.actions = ['removed-action', 'retained-action'].map((id) => ({
    type: 'annotation' as const,
    object: { id, text: id, anchor: null, appearance: null },
  }));
  const tour = createTourDocument('tour');
  tour.slides = [
    {
      kind: 'navigation',
      id: 'contents',
      title: 'Contents',
      description: '',
      background: { color: '#ffffff', image: null },
      narration: null,
      timing: slide.timing,
      buttons: slide.actions.map(({ object }) => ({
        id: `link-${object.id}`,
        label: object.text,
        action: { kind: 'action' as const, actionId: object.id },
      })),
    },
    slide,
  ];

  slide.actions.splice(0, 1);
  expect(parseTourDocument(tour).status).toBe('ok');
  const before = structuredClone(tour);
  const copy = structuredClone(tour);
  let next = 0;
  remapTourIdentities(copy, () => `copy-${++next}`, new Map());

  const contents = copy.slides[0]!;
  const image = copy.slides[1]!;
  if (contents.kind !== 'navigation' || image.kind !== 'image') throw new Error('Invalid fixture');
  expect(contents.buttons[0]!.action).toEqual({ kind: 'action', actionId: 'removed-action' });
  expect(contents.buttons[1]!.action).toEqual({
    kind: 'action',
    actionId: image.actions[0]!.object.id,
  });
  expect(image.actions[0]!.object.id).not.toBe('retained-action');

  expect(parseTourDocument(copy).status).toBe('ok');
  expect(tour).toEqual(before);
});
