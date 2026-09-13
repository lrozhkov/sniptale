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
  const slide = restored.slides[0];
  expect(slide?.narration?.assetId).toBe('new-audio');
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
