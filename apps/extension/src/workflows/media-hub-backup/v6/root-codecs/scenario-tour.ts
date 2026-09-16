import { parseTourDocument } from '@sniptale/runtime-contracts/scenario/tour-parser';
import type {
  TourDocument,
  TourImage,
  TourNarration,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { TOUR_LIMITS } from '@sniptale/runtime-contracts/scenario/types/tour';

/** Archive references name logical scenario children, never physical asset objects. */
export function encodePortableTour(tour: TourDocument) {
  const media = (value: TourImage | TourNarration | null) => {
    if (!value) return null;
    const { assetId, ...rest } = value;
    return { ...rest, scenarioAssetId: assetId };
  };
  return {
    ...tour,
    slides: tour.slides.map((slide) => ({
      ...slide,
      narration: media(slide.narration),
      ...(slide.kind === 'image'
        ? { image: media(slide.image) }
        : { background: { ...slide.background, image: media(slide.background.image) } }),
    })),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Decodes a bounded portable document before the restore owner publishes any media. */
export function decodePortableTour(
  value: unknown,
  refs: {
    assetIds: ReadonlyMap<string, string>;
    documentIds: ReadonlyMap<string, string>;
    rootIdMap: Readonly<Record<string, string>>;
  }
): TourDocument {
  if (
    !record(value) ||
    !Array.isArray(value['slides']) ||
    value['slides'].length > TOUR_LIMITS.maxSlides
  )
    throw new Error('Portable tour is invalid.');
  const media = (input: unknown, image: boolean) => {
    if (input === null) return null;
    if (!record(input) || typeof input['scenarioAssetId'] !== 'string' || 'assetId' in input)
      throw new Error('Portable tour media reference is invalid.');
    const { scenarioAssetId, ...rest } = input;
    const assetId = refs.assetIds.get(scenarioAssetId);
    if (!assetId) throw new Error('Portable tour media is missing.');
    if (!image) return { ...rest, assetId };
    const sourceId = rest['editDocumentId'];
    const editDocumentId =
      sourceId === null
        ? null
        : typeof sourceId === 'string'
          ? refs.documentIds.get(sourceId)
          : undefined;
    if (editDocumentId === undefined) throw new Error('Portable tour editor document is missing.');
    const galleryAssetId =
      typeof rest['galleryAssetId'] === 'string'
        ? (refs.rootIdMap[`media:library-item:${rest['galleryAssetId']}`] ?? null)
        : null;
    return { ...rest, assetId, editDocumentId, galleryAssetId };
  };
  const slides: unknown[] = value['slides'];
  const decoded = {
    ...value,
    slides: slides.map((slide) => {
      if (!record(slide)) throw new Error('Portable tour slide is invalid.');
      const narration = media(slide['narration'], false);
      if (slide['kind'] === 'image')
        return { ...slide, narration, image: media(slide['image'], true) };
      if (slide['kind'] !== 'navigation' || !record(slide['background']))
        throw new Error('Portable tour background is invalid.');
      return {
        ...slide,
        narration,
        background: { ...slide['background'], image: media(slide['background']['image'], true) },
      };
    }),
  };
  const parsed = parseTourDocument(decoded);
  if (parsed.status !== 'ok') throw new Error('Restored tour is invalid.');
  return parsed.document;
}
