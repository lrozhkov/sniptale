import {
  getTourHotspots,
  getTourAnnotations,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { createTourBackgroundMusic } from '@sniptale/runtime-contracts/scenario/types/tour';
import { expect, it } from 'vitest';
import { createGuideProject, createTourDocument, createTourImageSlide } from './factories';
import {
  applyTourCommands,
  getTourIncomingReferences,
  type TourResourceCatalog,
} from './tour-commands';
import type { TourImage } from '@sniptale/runtime-contracts/scenario/types/tour';

const image: TourImage = {
  assetId: 'asset',
  galleryAssetId: null,
  editDocumentId: null,
  width: 100,
  height: 50,
  alt: '',
  source: { kind: 'import', filename: 'image.png' },
};
const resources: TourResourceCatalog = {
  images: [image],
  audio: [{ assetId: 'audio', duration: 5 }],
};
function project() {
  const value = createGuideProject('Reference', 'guide', 1);
  value.tour = createTourDocument('tour');
  const slide = createTourImageSlide('first');
  slide.image = structuredClone(image);
  value.tour.slides = [slide, createTourImageSlide('second')];
  return value;
}

it('applies a detached batch, supports forward links and preserves the reference document', () => {
  const original = project();
  const before = structuredClone(original);
  const third = createTourImageSlide('third');
  const fourth = createTourImageSlide('fourth');
  const result = applyTourCommands(
    original,
    [
      { kind: 'insert-slide', slide: third, beforeId: 'second' },
      { kind: 'insert-slide', slide: fourth },
      { kind: 'move-slide', slideId: 'fourth', beforeId: 'first' },
    ],
    resources
  );
  expect(result.tour?.slides.map((slide) => slide.id)).toEqual([
    'fourth',
    'first',
    'third',
    'second',
  ]);
  expect(result.items).toEqual(original.items);
  expect(result.name).toBe(original.name);
  expect(original).toEqual(before);
});

it('rejects an entire batch with a missing destination or malformed geometry', () => {
  const original = project();
  const before = structuredClone(original);
  const bad = createTourImageSlide('bad');
  bad.camera.center.x = 2;
  expect(() =>
    applyTourCommands(
      original,
      [
        { kind: 'move-slide', slideId: 'first' },
        { kind: 'insert-slide', slide: bad },
      ],
      resources
    )
  ).toThrow('invalid');
  bad.camera.center.x = 0.5;
  expect(
    applyTourCommands(original, [{ kind: 'insert-slide', slide: bad }], resources).tour?.slides
  ).toHaveLength(3);
  expect(original).toEqual(before);
});

it('requires explicit repair of contents references and clears them atomically', () => {
  const original = project();
  const target = original.tour!.slides[1]!;
  if (target.kind !== 'image') throw new Error('Expected image.');
  target.actions = [
    {
      type: 'annotation',
      object: { id: 'target-action', text: '', anchor: null, appearance: null },
    },
  ];
  original.tour!.slides.push({
    kind: 'navigation',
    id: 'contents',
    title: '',
    description: '',
    background: { color: '#111827', image: null },
    narration: null,
    timing: target.timing,
    buttons: [{ id: 'jump', label: 'Jump', action: { kind: 'action', actionId: 'target-action' } }],
  });
  expect(getTourIncomingReferences(original.tour!, 'second')).toEqual(['jump']);
  expect(() =>
    applyTourCommands(
      original,
      [{ kind: 'remove-slide', slideId: 'second', incoming: 'reject' }],
      resources
    )
  ).toThrow('incoming');
  const result = applyTourCommands(
    original,
    [{ kind: 'remove-slide', slideId: 'second', incoming: 'clear' }],
    resources
  );
  expect(result.tour?.slides).toHaveLength(2);
  expect(result.tour?.slides[1]).toMatchObject({ buttons: [{ action: { kind: 'none' } }] });
});

it('duplicates authored object identities and self-navigation without cloning bytes', () => {
  const original = project();
  const slide = original.tour!.slides[0]!;
  if (slide.kind !== 'image') throw new Error('image expected');
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'hotspot'),
    ...[
      {
        id: 'hotspot',
        point: { x: 0.5, y: 0.5 },
        targetRect: null,
        label: 'Again',
        text: '',
        appearance: null,
        visual: { kind: 'point' as const, pulse: true },
      },
    ].map((object) => ({ type: 'hotspot' as const, object })),
  ];
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'annotation'),
    ...[{ id: 'annotation', text: 'Note', anchor: null, appearance: null }].map((object) => ({
      type: 'annotation' as const,
      object,
    })),
  ];
  let id = 0;
  const result = applyTourCommands(
    original,
    [{ kind: 'duplicate-slide', slideId: 'first', newId: 'copy' }],
    resources,
    () => `object-${++id}`
  );
  expect(result.tour?.slides[1]).toMatchObject({
    id: 'copy',
    image: { assetId: 'asset' },
    timing: {},
    actions: [
      { type: 'hotspot' as const, object: { id: 'object-1', visual: { kind: 'point' } } },
      { type: 'annotation' as const, object: { id: 'object-2' } },
    ],
  });
  expect(original.tour?.slides).toHaveLength(2);
});

it('duplicates a mixed object order through remapped identities', () => {
  const original = project();
  const slide = original.tour!.slides[0]!;
  if (slide.kind !== 'image') throw new Error('image expected');
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'hotspot'),
    ...[
      {
        id: 'hotspot',
        point: { x: 0.5, y: 0.5 },
        targetRect: null,
        label: 'Again',
        text: '',
        appearance: null,
        visual: { kind: 'point' as const, pulse: true },
      },
    ].map((object) => ({ type: 'hotspot' as const, object })),
  ];
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'annotation'),
    ...[{ id: 'annotation', text: 'Note', anchor: null, appearance: null }].map((object) => ({
      type: 'annotation' as const,
      object,
    })),
  ];
  slide.masks = [
    {
      id: 'mask',
      rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      kind: 'blur',
      color: '#f97316',
      opacity: 0.3,
    },
  ];
  slide.actions.sort(
    (left, right) =>
      ['mask', 'annotation', 'hotspot'].indexOf(left.object.id) -
      ['mask', 'annotation', 'hotspot'].indexOf(right.object.id)
  );
  let id = 0;
  const result = applyTourCommands(
    original,
    [{ kind: 'duplicate-slide', slideId: 'first', newId: 'copy' }],
    resources,
    () => `object-${++id}`
  );
  const copy = result.tour?.slides[1];
  if (copy?.kind !== 'image') throw new Error('image expected');
  expect(copy.actions.map((entry) => entry.object.id)).toEqual(['object-1', 'object-2']);
  expect(getTourHotspots(copy).map((entry) => entry.id)).toEqual(['object-2']);
  expect(getTourAnnotations(copy).map((entry) => entry.id)).toEqual(['object-1']);
  expect(copy.masks.map((entry) => entry.id)).toEqual(['object-3']);
});

it('keeps provenance and duration capabilities immutable while allowing authored text and trim', () => {
  const original = project();
  const slide = structuredClone(original.tour!.slides[0]!);
  if (slide.kind !== 'image' || !slide.image) throw new Error('image expected');
  slide.image.alt = 'Description';
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
          duration: 5,
          trimStart: 1,
          trimEnd: 4,
          gain: 1,
          transcript: 'Speech',
        },
        trigger: 'enter' as const,
      },
    },
  });
  expect(
    applyTourCommands(original, [{ kind: 'replace-slide', slideId: 'first', slide }], resources)
      .tour?.slides[0]
  ).toMatchObject({ image: { alt: 'Description' } });
  slide.image.source = { kind: 'import', filename: 'invented.png' };
  expect(() =>
    applyTourCommands(original, [{ kind: 'replace-slide', slideId: 'first', slide }], resources)
  ).toThrow('catalog');
  slide.image.source = image.source;
  slide.actions[0]!.object.narration!.duration = 6;
  expect(() =>
    applyTourCommands(original, [{ kind: 'replace-slide', slideId: 'first', slide }], resources)
  ).toThrow('catalog');
});

it('initializes a tour without changing the guide and rejects invalid identity operations', () => {
  const guide = createGuideProject('Guide', 'guide', 1);
  const result = applyTourCommands(
    guide,
    [{ kind: 'replace-tour', tour: createTourDocument('tour') }],
    resources
  );
  expect(result.tour?.id).toBe('tour');
  expect(guide.tour).toBeUndefined();
  expect(() =>
    applyTourCommands(guide, [{ kind: 'move-slide', slideId: 'missing' }], resources)
  ).toThrow('unavailable');
  expect(() =>
    applyTourCommands(
      project(),
      [{ kind: 'replace-slide', slideId: 'first', slide: createTourImageSlide('different') }],
      resources
    )
  ).toThrow('identity');
  expect(() =>
    applyTourCommands(
      project(),
      [{ kind: 'duplicate-slide', slideId: 'first', newId: 'second' }],
      resources
    )
  ).toThrow('invalid');
  expect(() => applyTourCommands(project(), [], resources)).toThrow('count');
});

it('keeps adjacent/self moves stable and removes an unreferenced slide', () => {
  const original = project();
  for (const beforeId of ['first', 'second'])
    expect(
      applyTourCommands(original, [{ kind: 'move-slide', slideId: 'first', beforeId }], resources)
        .tour
    ).toEqual(original.tour);
  expect(
    applyTourCommands(
      original,
      [{ kind: 'remove-slide', slideId: 'second', incoming: 'reject' }],
      resources
    ).tour?.slides
  ).toHaveLength(1);
  expect(() =>
    applyTourCommands(original, [{ kind: 'move-slide', slideId: 'missing' }], resources)
  ).toThrow();
});

it('duplicates navigation buttons, preserves external links, and repairs branch targets', () => {
  const original = project();
  const timing = { ...original.tour!.slides[0]!.timing };
  const inserted = applyTourCommands(
    original,
    [
      {
        kind: 'insert-slide',
        slide: {
          kind: 'navigation',
          id: 'nav',
          title: 'Contents',
          description: '',
          background: { color: '#ffffff', image },
          buttons: [
            { id: 'back', label: 'Again', action: { kind: 'slide', slideId: 'nav' } },
            { id: 'site', label: 'Website', action: { kind: 'url', url: 'https://example.com/' } },
          ],
          narration: null,
          timing,
        },
      },
    ],
    resources
  );
  let id = 0;
  const copied = applyTourCommands(
    inserted,
    [{ kind: 'duplicate-slide', slideId: 'nav', newId: 'nav-copy' }],
    resources,
    () => `button-${++id}`
  );
  expect(copied.tour?.slides.at(-1)).toMatchObject({
    buttons: [
      { id: 'button-1', action: { slideId: 'nav-copy' } },
      { id: 'button-2', action: { kind: 'url' } },
    ],
  });
  const replacement = structuredClone(copied.tour!);
  const result = applyTourCommands(
    copied,
    [
      { kind: 'replace-tour', tour: replacement },
      { kind: 'remove-slide', slideId: 'nav', incoming: 'clear' },
    ],
    resources
  );
  expect(result.tour?.slides.some((slide) => slide.id === 'nav')).toBe(false);
});

it('rejects template ownership and foreign media, and accepts equivalent provenance key order', () => {
  const original = project();
  expect(() =>
    applyTourCommands(
      { ...original, purpose: 'step-template' },
      [{ kind: 'replace-tour', tour: original.tour! }],
      resources
    )
  ).toThrow('template');
  const replacement = structuredClone(original.tour!);
  const slide = replacement.slides[0]!;
  if (slide.kind !== 'image' || !slide.image) throw new Error('image expected');
  slide.image.source = { filename: 'image.png', kind: 'import' };
  expect(
    applyTourCommands(original, [{ kind: 'replace-tour', tour: replacement }], resources).tour
  ).toBeDefined();
  slide.image.assetId = 'foreign';
  expect(() =>
    applyTourCommands(original, [{ kind: 'replace-tour', tour: replacement }], resources)
  ).toThrow('catalog');
});

it('keeps a reusable material after unlink and clears every attachment on material deletion', () => {
  const original = project();
  const slide = original.tour!.slides[0]!;
  if (slide.kind !== 'image') throw Error('image');
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'annotation'),
    ...[{ id: 'hint', text: 'Read', anchor: null, appearance: null }].map((object) => ({
      type: 'annotation' as const,
      object,
    })),
  ];
  const narration = {
    assetId: 'audio',
    duration: 5,
    trimStart: 1,
    trimEnd: 4,
    gain: 1,
    transcript: '',
  };
  original.tour!.audioResources = [{ assetId: 'audio', duration: 5, name: 'Take.wav' }];
  const attached = applyTourCommands(
    original,
    [{ kind: 'set-narration', slideId: 'first', objectId: 'hint', narration }],
    resources
  );
  const unlinked = applyTourCommands(
    attached,
    [{ kind: 'set-narration', slideId: 'first', objectId: 'hint', narration: null }],
    resources
  );
  expect(unlinked.tour!.audioResources).toEqual(original.tour!.audioResources);
  expect(unlinked.tour!.slides[0]!.narration).toBeNull();
  const deleted = applyTourCommands(
    attached,
    [{ kind: 'remove-audio-resource', assetId: 'audio' }],
    resources
  );
  expect(deleted.tour!.audioResources).toEqual([]);
  expect(deleted.tour!.slides[0]).toMatchObject({
    narration: null,
    actions: [{ type: 'annotation' as const, object: { narration: null } }],
  });
  expect(attached.tour!.slides[0]).toMatchObject({
    narration: null,
    actions: [
      {
        type: 'annotation' as const,
        object: { narration: { ...narration, trigger: 'enter' as const } },
      },
    ],
  });
  expect(() =>
    applyTourCommands(
      original,
      [{ kind: 'set-narration', slideId: 'first', objectId: 'missing', narration }],
      resources
    )
  ).toThrow('unavailable');
  expect(() =>
    applyTourCommands(
      original,
      [
        {
          kind: 'set-narration',
          slideId: 'first',
          objectId: 'hint',
          narration: { ...narration, assetId: 'foreign' },
        },
      ],
      resources
    )
  ).toThrow('catalog');
  expect(() =>
    applyTourCommands(original, [{ kind: 'remove-audio-resource', assetId: 'missing' }], resources)
  ).toThrow('unavailable');
});

it('keeps detached music on unbind but clears binding on explicit resource removal', () => {
  const value = project();
  value.tour!.backgroundMusic = createTourBackgroundMusic({ assetId: 'audio', duration: 5 });
  const unbound = applyTourCommands(
    value,
    [{ kind: 'replace-tour', tour: { ...value.tour!, backgroundMusic: null } }],
    resources
  );
  expect(unbound.tour!.audioResources?.some((entry) => entry.assetId === 'audio')).toBe(true);
  const removed = applyTourCommands(
    value,
    [{ kind: 'remove-audio-resource', assetId: 'audio' }],
    resources
  );
  expect(removed.tour!.backgroundMusic).toBeNull();
  expect(value.tour!.backgroundMusic?.assetId).toBe('audio');
});
