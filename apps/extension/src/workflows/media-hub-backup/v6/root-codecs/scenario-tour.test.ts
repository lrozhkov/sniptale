import { createTourBackgroundMusic } from '@sniptale/runtime-contracts/scenario/types/tour';
import { expect, it } from 'vitest';
import {
  createTourDocument,
  createTourImageSlide,
} from '../../../../features/scenario/project/public';
import { encodePortableTour, decodePortableTour } from './scenario-tour';

function source() {
  const tour = createTourDocument('tour');
  const slide = createTourImageSlide('slide');
  slide.image = {
    assetId: 'image',
    galleryAssetId: 'gallery',
    editDocumentId: 'edit',
    width: 100,
    height: 80,
    alt: '',
    source: { kind: 'import', filename: 'source.png' },
  };
  slide.narration = {
    assetId: 'audio',
    duration: 3,
    trimStart: 0,
    trimEnd: 3,
    gain: 1,
    transcript: 'voice',
  };
  tour.slides = [slide];
  tour.backgroundMusic = createTourBackgroundMusic({ assetId: 'audio', duration: 3 });
  tour.audioResources = [{ assetId: 'audio', duration: 3, name: 'Music' }];
  tour.stage.image = structuredClone(slide.image);
  return tour;
}
const refs = {
  assetIds: new Map([
    ['image', 'new-image'],
    ['audio', 'new-audio'],
  ]),
  documentIds: new Map([['edit', 'new-edit']]),
  rootIdMap: { 'media:library-item:gallery': 'new-gallery' },
};
it('roundtrips portable image and audio references and remaps editor/library identities', () => {
  const portable = encodePortableTour(source());
  expect(JSON.stringify(portable)).not.toContain('"assetId"');
  const restored = decodePortableTour(portable, refs);
  expect(restored.stage.image).toMatchObject({
    assetId: 'new-image',
    editDocumentId: 'new-edit',
    galleryAssetId: 'new-gallery',
  });
  const slide = restored.slides[0];
  expect(slide?.narration?.assetId).toBe('new-audio');
  expect(restored.backgroundMusic?.assetId).toBe('new-audio');
  if (slide?.kind !== 'image') throw new Error('Expected image');
  expect(slide.image).toMatchObject({
    assetId: 'new-image',
    editDocumentId: 'new-edit',
    galleryAssetId: 'new-gallery',
  });
});
it('rejects missing children and malformed portable tour before publication', () => {
  expect(() =>
    decodePortableTour(encodePortableTour(source()), { ...refs, assetIds: new Map() })
  ).toThrow('missing');
  expect(() =>
    decodePortableTour(encodePortableTour(source()), { ...refs, documentIds: new Map() })
  ).toThrow('missing');
  expect(() => decodePortableTour(source(), refs)).toThrow('reference');
  expect(() => decodePortableTour({ slides: new Array(301) }, refs)).toThrow('invalid');
});

it('rejects foreign or physical stage references independently of valid slide media', () => {
  const portable = encodePortableTour(source());
  for (const image of [
    { ...portable.stage.image, scenarioAssetId: 'foreign' },
    { ...portable.stage.image, assetId: 'physical' },
    {},
  ]) {
    expect(() =>
      decodePortableTour({ ...portable, stage: { ...portable.stage, image } }, refs)
    ).toThrow();
  }
});
it('preserves absent and explicitly removed legacy stage bindings without materializing defaults', () => {
  const tour = createTourDocument('legacy');
  expect(decodePortableTour(encodePortableTour(tour), refs).stage).toEqual(tour.stage);
  tour.stage.image = null;
  expect(decodePortableTour(encodePortableTour(tour), refs).stage).toEqual(tour.stage);
});

it('rejects foreign and physical music refs before restore', () => {
  const portable = encodePortableTour(source());
  for (const backgroundMusic of [
    { ...portable.backgroundMusic, scenarioAssetId: 'foreign' },
    { ...portable.backgroundMusic, assetId: 'raw' },
  ])
    expect(() => decodePortableTour({ ...portable, backgroundMusic }, refs)).toThrow();
});

// Frozen v6 shape emitted by 2268d6208: catalog IDs stayed raw logical child IDs.
const legacyAudioTour = {
  version: 1,
  id: 'legacy-tour',
  stage: { aspect: '16:9', background: '#000000' },
  style: {
    accent: '#ffffff',
    text: '#ffffff',
    surface: '#000000',
    textAppearance: { presentation: 'callout', alignment: 'start', placement: 'auto' },
  },
  playback: { autoplay: false, loop: false, minimumHoldSeconds: 4, autoZoom: true },
  transition: { kind: 'none', durationMs: 0, hotspotTravelMs: 0 },
  audioResources: [{ assetId: 'voice', duration: 3, name: 'Voice.wav' }],
  slides: [
    {
      kind: 'navigation',
      id: 'slide',
      title: '',
      description: '',
      background: { color: '#000000', image: null },
      buttons: [],
      narration: {
        scenarioAssetId: 'voice',
        duration: 3,
        trimStart: 0,
        trimEnd: 3,
        gain: 1,
        transcript: '',
      },
      timing: { mode: 'manual', holdSeconds: 4, truncateNarration: false, autoplayTarget: null },
    },
  ],
  endScreen: { enabled: false, title: '', description: '', button: null, restart: true },
};
it.each(['voice', 'copied-voice'])(
  'restores the pre-B31 catalog into declared child %s',
  (assetId) => {
    const restored = decodePortableTour(legacyAudioTour, {
      ...refs,
      assetIds: new Map([['voice', assetId]]),
    });
    expect(restored.audioResources).toEqual([{ assetId, duration: 3, name: 'Voice.wav' }]);
    expect(restored.slides[0]?.narration?.assetId).toBe(assetId);
    expect(restored.backgroundMusic).toBeUndefined();
    expect(legacyAudioTour.audioResources[0]?.assetId).toBe('voice');
  }
);
it('limits legacy catalog admission to one declared logical reference and valid metadata', () => {
  const mapping = { ...refs, assetIds: new Map([['voice', 'restored']]) };
  for (const resource of [
    { assetId: 'voice', scenarioAssetId: 'voice', duration: 3, name: 'Ambiguous' },
    { assetId: 'foreign', duration: 3, name: 'Foreign' },
    { duration: 3, name: 'Missing' },
    { assetId: 42, duration: 3, name: 'Malformed' },
    { assetId: 'voice', duration: -1, name: 'Invalid' },
    { assetId: 'voice', duration: 3, name: 'Extra', extra: true },
  ])
    expect(() =>
      decodePortableTour({ ...legacyAudioTour, audioResources: [resource] }, mapping)
    ).toThrow();
  expect(() => decodePortableTour(legacyAudioTour, { ...mapping, assetIds: new Map() })).toThrow(
    'missing'
  );
});
