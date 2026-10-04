import { parseTourDocument } from '@sniptale/runtime-contracts/scenario/tour-parser';
import type {
  TourAudioResource,
  TourBackgroundMusic,
  TourDocument,
  TourImage,
  TourNarration,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { TOUR_LIMITS } from '@sniptale/runtime-contracts/scenario/types/tour';

/** Archive references name logical scenario children, never physical asset objects. */
export function encodePortableTour(tour: TourDocument) {
  const media = (
    value: TourImage | TourNarration | TourBackgroundMusic | TourAudioResource | null
  ) => {
    if (!value) return null;
    const { assetId, ...rest } = value;
    return { ...rest, scenarioAssetId: assetId };
  };
  return {
    ...tour,
    ...(tour.audioResources === undefined
      ? {}
      : { audioResources: tour.audioResources.map(media) }),
    ...(tour.backgroundMusic === undefined ? {} : { backgroundMusic: media(tour.backgroundMusic) }),
    stage: {
      ...tour.stage,
      ...(tour.stage.image === undefined ? {} : { image: media(tour.stage.image) }),
    },
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
  // Pre-B31 v6 catalogs used assetId for logical children; other media never did.
  const catalogMedia = (input: unknown) => {
    if (record(input) && typeof input['assetId'] === 'string' && !('scenarioAssetId' in input)) {
      const { assetId, ...rest } = input;
      return media({ ...rest, scenarioAssetId: assetId }, false);
    }
    return media(input, false);
  };
  if (!record(value['stage'])) throw new Error('Portable tour stage is invalid.');
  const stage = value['stage'];
  const resources = value['audioResources'];
  if (
    resources !== undefined &&
    (!Array.isArray(resources) || resources.length > TOUR_LIMITS.maxAudioResources)
  )
    throw new Error('Portable tour audio resources are invalid.');
  const slides: unknown[] = value['slides'];
  const decoded = {
    ...value,
    ...(resources === undefined ? {} : { audioResources: resources.map(catalogMedia) }),
    ...('backgroundMusic' in value
      ? { backgroundMusic: media(value['backgroundMusic'], false) }
      : {}),
    stage: { ...stage, ...('image' in stage ? { image: media(stage['image'], true) } : {}) },
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
