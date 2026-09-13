import { expect, it } from 'vitest';
import {
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
} from './factories';
import { getScenarioResourceReferences, remapTourIdentities } from './tour-resources';
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
  slide.narration = {
    assetId: 'audio',
    duration: 3,
    trimStart: 0,
    trimEnd: 3,
    gain: 1,
    transcript: '',
  };
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
  first.hotspots = [
    {
      id: 'hotspot',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      label: 'next',
      text: '',
      action: { kind: 'slide', slideId: 'second' },
      appearance: null,
      pulse: true,
    },
  ];
  first.timing.autoplayTarget = 'second';
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
  expect(first.hotspots[0]?.action).toEqual({ kind: 'slide', slideId: second.id });
  expect(first.timing.autoplayTarget).toBe(second.id);
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
        annotations: [
          { id: 'hint', text: 'hint', anchor: null, appearance: null, narration: voice },
        ],
      },
    ],
  };
  expect([...getScenarioResourceReferences(project).assets]).toEqual(['detached', 'object-audio']);
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
  slide.narration = narration;
  slide.annotations = [
    {
      id: 'intro',
      text: 'Intro',
      anchor: null,
      appearance: null,
      narration: { ...narration, trigger: 'enter' },
    },
    {
      id: 'detail',
      text: 'Detail',
      anchor: null,
      appearance: null,
      narration: { ...narration, trigger: 'activation' },
    },
    { id: 'silent', text: 'Silent', anchor: null, appearance: null },
  ];
  expect(getTourNarrationCues(slide, { kind: 'enter' }).map((c) => c.objectId)).toEqual([
    null,
    'intro',
  ]);
  expect(
    getTourNarrationCues(slide, { kind: 'activation', objectId: 'detail' }).map((c) => c.objectId)
  ).toEqual(['detail']);
  expect(getTourNarrationCues(slide, { kind: 'activation', objectId: 'missing' })).toEqual([]);
});
