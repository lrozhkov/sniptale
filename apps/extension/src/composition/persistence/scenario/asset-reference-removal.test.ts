import {
  getTourHotspots,
  getTourAnnotations,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { createTourBackgroundMusic } from '@sniptale/runtime-contracts/scenario/types/tour';
import { expect, it } from 'vitest';
import {
  applyGuideStructureOperation,
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { getScenarioResourceReferences } from '../../../features/scenario/project/tour-resources';
import { createScenarioProjectEntry } from './projects/entry';
import { removeScenarioAssetReferences } from './asset-reference-removal';
import { parseScenarioProjectEntry } from './read-guards';

function fixture() {
  const project = createGuideProject('Keep title', 'scenario', 10);
  const step = createGuideStep('Keep step', 'step');
  const removed = createGuideImageBlock({
    id: 'removed-block',
    assetId: 'image-remove',
    width: 800,
    height: 400,
    source: { kind: 'import', filename: 'remove.png' },
  });
  removed.caption = 'Keep caption';
  removed.editDocumentId = 'removed-document';
  removed.width = 'half';
  step.blocks.push(
    removed,
    createGuideImageBlock({
      id: 'keep-block',
      assetId: 'image-keep',
      width: 300,
      height: 200,
      source: { kind: 'import', filename: 'keep.png' },
    })
  );
  project.items.push(step);
  const tour = createTourDocument('tour');
  const slide = createTourImageSlide('slide');
  slide.image = {
    assetId: 'image-remove',
    galleryAssetId: null,
    editDocumentId: null,
    width: 800,
    height: 400,
    alt: '',
    source: { kind: 'import', filename: 'remove.png' },
  };
  const removedVoice = {
    assetId: 'audio-remove',
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
      narration: { ...removedVoice, trigger: 'enter' as const },
    },
  });
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'hotspot'),
    ...[
      {
        id: 'hotspot',
        point: { x: 0.5, y: 0.5 },
        targetRect: null,
        label: 'Keep hotspot',
        text: '',
        appearance: null,
        narration: { ...removedVoice, trigger: 'activation' as const },
        visual: { kind: 'point' as const, pulse: false },
      },
    ].map((object) => ({ type: 'hotspot' as const, object })),
  ];
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'annotation'),
    ...[
      {
        id: 'annotation',
        text: 'Keep annotation',
        anchor: null,
        appearance: null,
        narration: { ...removedVoice, trigger: 'enter' as const },
      },
    ].map((object) => ({ type: 'annotation' as const, object })),
  ];
  slide.masks = [
    {
      id: 'mask',
      kind: 'blur',
      rect: { x: 0, y: 0, width: 0.2, height: 0.2 },
      color: '#ffffff',
      opacity: 0.5,
      narration: { ...removedVoice, trigger: 'enter' as const },
    },
  ];
  const navigation = {
    kind: 'navigation' as const,
    id: 'navigation',
    title: 'Keep navigation',
    description: '',
    background: { color: '#ffffff', image: { ...slide.image, assetId: 'image-remove' } },
    buttons: [
      {
        id: 'button',
        label: 'Keep button',
        action: { kind: 'next' as const },
        narration: { ...removedVoice, trigger: 'activation' as const },
      },
    ],
    narration: removedVoice,
    timing: slide.timing,
  };
  tour.slides = [slide, navigation];
  tour.backgroundMusic = createTourBackgroundMusic({ assetId: 'audio-remove', duration: 2 });
  tour.stage.image = structuredClone(slide.image);
  tour.stage.imageFit = 'contain';
  tour.audioResources = [
    { assetId: 'audio-remove', duration: 2, name: 'Remove' },
    { assetId: 'audio-keep', duration: 3, name: 'Keep' },
  ];
  project.tour = tour;
  const first = createScenarioProjectEntry({ existing: undefined, project, updatedAt: 10 });
  const entry = createScenarioProjectEntry({
    existing: first,
    project: { ...first.project, name: 'Current' },
    updatedAt: 20,
  });
  return entry;
}

it.each([false, true])(
  'removes selected references from all retained states (editing=%s)',
  (editing) => {
    const source = fixture();
    const entry = {
      ...source,
      ...(editing
        ? {
            editingHistory: {
              version: 1 as const,
              past: [{ ...source.project, name: 'Past' }],
              future: [{ ...source.project, name: 'Future' }],
            },
          }
        : {}),
    };
    const original = structuredClone(entry);
    const next = removeScenarioAssetReferences(
      entry,
      new Set(['image-remove', 'audio-remove']),
      30
    );
    expect(entry).toEqual(original);
    expect(next.workspaceRevision).toBe(entry.workspaceRevision + 1);
    expect(next.history?.[0]?.savedAt).toBe(entry.history?.[0]?.savedAt);
    for (const project of [
      next.project,
      ...(next.history ?? []).map((version) => version.project),
      ...(next.editingHistory?.past ?? []),
      ...(next.editingHistory?.future ?? []),
    ]) {
      expect(project.tour?.backgroundMusic).toBeNull();
      expect(project.tour?.stage.image).toBeNull();
      expect(project.tour?.stage.imageFit).toBe('contain');
      const refs = getScenarioResourceReferences(project);
      expect(refs.assets.has('image-remove')).toBe(false);
      expect(refs.assets.has('audio-remove')).toBe(false);
      expect(refs.documents.has('removed-document')).toBe(false);
      expect(refs.assets.has('image-keep')).toBe(true);
      expect(refs.assets.has('audio-keep')).toBe(true);
      const step = project.items[0];
      expect(step?.kind === 'step' ? step.blocks[0] : null).toMatchObject({
        kind: 'image-slot',
        id: 'removed-block',
        caption: 'Keep caption',
        width: 'half',
      });
      expect(step?.kind === 'step' ? step.blocks[1] : null).toMatchObject({
        kind: 'image',
        id: 'keep-block',
      });
      const slide = project.tour?.slides[0];
      const navigation = project.tour?.slides[1];
      expect(slide?.kind === 'image' ? slide.image : undefined).toBeNull();
      expect(
        navigation?.kind === 'navigation' ? navigation.background.image : undefined
      ).toBeNull();
      expect(slide?.narration).toBeNull();
      expect(navigation?.narration).toBeNull();
      if (slide?.kind === 'image') {
        expect(getTourHotspots(slide)[0]?.narration).toBeNull();
        expect(getTourAnnotations(slide)[0]?.narration).toBeNull();
        expect(slide.masks[0]?.narration).toBeNull();
      }
      if (navigation?.kind === 'navigation') expect(navigation.buttons[0]?.narration).toBeNull();
      expect(project.tour?.audioResources).toEqual([
        { assetId: 'audio-keep', duration: 3, name: 'Keep' },
      ]);
    }
    expect(next.editingHistory?.past.map((project) => project.name)).toEqual(
      entry.editingHistory?.past.map((project) => project.name)
    );
    expect(next.editingHistory?.future.map((project) => project.name)).toEqual(
      entry.editingHistory?.future.map((project) => project.name)
    );
    expect(parseScenarioProjectEntry(next)).not.toBeNull();
  }
);

it('keeps a valid entry and revision when none of the selected assets are referenced', () => {
  const entry = fixture();
  expect(removeScenarioAssetReferences(entry, new Set(['absent']), 30)).toEqual(entry);
  expect(() => removeScenarioAssetReferences(entry, new Set(['image-remove']), -1)).toThrow();
});

it.each([undefined, 'start', 'center', 'end'] as const)(
  'retains caption alignment %s through reference removal, saved history and slot refill',
  (captionAlignment) => {
    const entry = fixture();
    for (const project of [entry.project, ...(entry.history ?? []).map((item) => item.project)]) {
      const step = project.items[0];
      const block = step?.kind === 'step' ? step.blocks[0] : undefined;
      if (block?.kind !== 'image') throw new Error('Expected image');
      if (captionAlignment !== undefined) block.captionAlignment = captionAlignment;
    }
    const original = structuredClone(entry);
    const removed = removeScenarioAssetReferences(entry, new Set(['image-remove']), 30);
    for (const project of [
      removed.project,
      ...(removed.history ?? []).map((item) => item.project),
    ]) {
      const step = project.items[0];
      if (step?.kind !== 'step') throw new Error('Expected step');
      const slot = step.blocks[0];
      if (slot?.kind !== 'image-slot') throw new Error('Expected slot');
      expect(slot.captionAlignment).toBe(captionAlignment);
      expect(Object.hasOwn(slot, 'captionAlignment')).toBe(captionAlignment !== undefined);
      const refilled = applyGuideStructureOperation(project, {
        kind: 'place-image',
        sourceBlockId: 'keep-block',
        itemId: step.id,
        blockId: slot.id,
      });
      const item = refilled.items[0];
      const image = item?.kind === 'step' ? item.blocks[0] : undefined;
      if (image?.kind !== 'image') throw new Error('Expected refilled image');
      expect(image.captionAlignment).toBe(captionAlignment);
      expect(image.caption).toBe('Keep caption');
      expect(Object.hasOwn(image, 'captionAlignment')).toBe(captionAlignment !== undefined);
    }
    expect(entry).toEqual(original);
    expect(parseScenarioProjectEntry(removed)).not.toBeNull();
  }
);

it.each(['past', 'future'] as const)(
  'removes a resource referenced only by the %s branch without adding an action',
  (branch) => {
    const source = fixture();
    const { tour: _tour, ...current } = source.project;
    const { history: _history, ...base } = source;
    const entry = {
      ...base,
      project: { ...current, items: [] },
      editingHistory: {
        version: 1 as const,
        past: branch === 'past' ? [source.project] : [],
        future: branch === 'future' ? [source.project] : [],
      },
    };
    const before = structuredClone(entry);
    const next = removeScenarioAssetReferences(
      entry,
      new Set(['image-remove', 'audio-remove']),
      30
    );
    expect(next.workspaceRevision).toBe(entry.workspaceRevision + 1);
    expect(next.project.items).toEqual([]);
    expect(next.editingHistory?.past).toHaveLength(entry.editingHistory.past.length);
    expect(next.editingHistory?.future).toHaveLength(entry.editingHistory.future.length);
    const retained = next.editingHistory?.[branch][0];
    if (!retained) throw new Error('Missing retained state');
    const references = getScenarioResourceReferences(retained);
    expect(references.assets.has('image-remove')).toBe(false);
    expect(references.assets.has('audio-remove')).toBe(false);
    expect(references.documents.has('removed-document')).toBe(false);
    expect(references.assets.has('image-keep')).toBe(true);
    expect(retained.updatedAt).toBe(source.project.updatedAt);
    expect(entry).toEqual(before);
    expect(
      removeScenarioAssetReferences(next, new Set(['image-remove', 'audio-remove']), 40)
    ).toEqual(next);
  }
);
