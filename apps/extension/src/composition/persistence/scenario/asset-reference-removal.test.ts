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
  slide.narration = removedVoice;
  slide.hotspots = [
    {
      id: 'hotspot',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      label: 'Keep hotspot',
      text: '',
      action: { kind: 'next' },
      appearance: null,
      pulse: false,
      narration: { ...removedVoice, trigger: 'activation' },
    },
  ];
  slide.annotations = [
    {
      id: 'annotation',
      text: 'Keep annotation',
      anchor: null,
      appearance: null,
      narration: { ...removedVoice, trigger: 'enter' },
    },
  ];
  slide.masks = [
    {
      id: 'mask',
      kind: 'highlight',
      rect: { x: 0, y: 0, width: 0.2, height: 0.2 },
      color: '#ffffff',
      opacity: 0.5,
      narration: { ...removedVoice, trigger: 'enter' },
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

it('removes selected image and audio references from current and saved history', () => {
  const entry = fixture();
  const original = structuredClone(entry);
  const next = removeScenarioAssetReferences(entry, new Set(['image-remove', 'audio-remove']), 30);
  expect(entry).toEqual(original);
  expect(next.workspaceRevision).toBe(entry.workspaceRevision + 1);
  expect(next.history?.[0]?.savedAt).toBe(entry.history?.[0]?.savedAt);
  for (const project of [next.project, ...(next.history ?? []).map((version) => version.project)]) {
    expect(project.tour?.stage.image).toBeNull();
    expect(project.tour?.stage.imageFit).toBe('contain');
    const refs = getScenarioResourceReferences(project);
    expect(refs.assets.has('image-remove')).toBe(false);
    expect(refs.assets.has('audio-remove')).toBe(false);
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
    expect(navigation?.kind === 'navigation' ? navigation.background.image : undefined).toBeNull();
    expect(slide?.narration).toBeNull();
    expect(navigation?.narration).toBeNull();
    if (slide?.kind === 'image') {
      expect(slide.hotspots[0]?.narration).toBeNull();
      expect(slide.annotations[0]?.narration).toBeNull();
      expect(slide.masks[0]?.narration).toBeNull();
    }
    if (navigation?.kind === 'navigation') expect(navigation.buttons[0]?.narration).toBeNull();
    expect(project.tour?.audioResources).toEqual([
      { assetId: 'audio-keep', duration: 3, name: 'Keep' },
    ]);
  }
  expect(parseScenarioProjectEntry(next)).not.toBeNull();
});

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
