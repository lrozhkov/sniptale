import { parseTourDocument } from '@sniptale/runtime-contracts/scenario/tour-parser';
import type {
  GuideImageBlock,
  GuideParagraph,
  GuideProject,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  TOUR_LIMITS,
  type TourDocument,
  type TourImage,
  type TourNavigationSlide,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { createTourDocument, createTourImageSlide } from './factories';
import { mapTourCapturePoint, mapTourCaptureRect, type TourCaptureMapping } from './tour-geometry';

export interface TourMaterial {
  image: TourImage;
  title: string;
  description: string;
  origin?: { stepId: string; blockId: string };
  /** Supplied only when acquisition or the edit document establishes the bitmap transform. */
  captureMapping?: TourCaptureMapping;
  videoGeometryUnchanged?: boolean;
}
export interface TourGenerationIssue {
  kind: 'place-hotspot' | 'text-only' | 'missing-image' | 'text-overflow';
  sourceId: string;
}
export interface TourGenerationProposal {
  tour: TourDocument;
  issues: TourGenerationIssue[];
}

function boundedText(text: string, sourceId: string, issues: TourGenerationIssue[]): string {
  if (text.length <= TOUR_LIMITS.maxTextLength) return text;
  issues.push({ kind: 'text-overflow', sourceId });
  return text.slice(0, TOUR_LIMITS.maxTextLength);
}

function materialSlide(
  material: TourMaterial,
  issues: TourGenerationIssue[],
  nextId: () => string
) {
  const slide = createTourImageSlide(nextId());
  slide.title = material.title;
  slide.image = structuredClone(material.image);
  slide.origin = material.origin ? { ...material.origin } : null;
  const sourceId = material.origin?.blockId ?? slide.id;
  slide.image.alt = boundedText(slide.image.alt, sourceId, issues);
  const source = material.image.source;
  const point =
    source.kind === 'capture' && material.captureMapping
      ? mapTourCapturePoint(source.interactionPoint ?? source.cursorPoint, material.captureMapping)
      : source.kind === 'video-frame' &&
          source.action?.kind === 'CLICK' &&
          (material.videoGeometryUnchanged ?? !material.image.editDocumentId)
        ? source.action.point
        : null;
  const targetRect =
    source.kind === 'capture' && material.captureMapping
      ? mapTourCaptureRect(source.target?.rect ?? null, material.captureMapping)
      : null;
  const text = boundedText(material.description, sourceId, issues);
  if (point)
    slide.hotspots.push({
      id: nextId(),
      point: { ...point },
      targetRect,
      label: material.title,
      text,
      action: { kind: 'next' },
      appearance: null,
      pulse: true,
    });
  else {
    if (source.kind !== 'import') issues.push({ kind: 'place-hotspot', sourceId });
    if (text)
      slide.annotations.push({
        id: nextId(),
        text,
        anchor: null,
        appearance: { presentation: 'caption-bottom', alignment: 'start', placement: 'auto' },
      });
  }
  return slide;
}
function validate(proposal: TourGenerationProposal): TourGenerationProposal {
  const parsed = parseTourDocument(proposal.tour);
  if (parsed.status !== 'ok')
    throw new Error('Generated tour exceeds the document limits or has invalid resources.');
  return { tour: parsed.document, issues: proposal.issues };
}

/** A proposal never publishes data; its issues must be resolved or acknowledged in the conversion UI. */
export function generateTourFromMaterials(
  materials: readonly TourMaterial[],
  nextId: () => string = () => crypto.randomUUID()
): TourGenerationProposal {
  if (materials.length > TOUR_LIMITS.maxSlides) throw new Error('Too many tour materials.');
  const issues: TourGenerationIssue[] = [];
  const tour = createTourDocument(nextId());
  tour.slides = materials.map((material) => materialSlide(material, issues, nextId));
  return validate({ tour, issues });
}
function paragraphsText(paragraphs: GuideParagraph[]): string {
  return paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join('')).join('\n');
}

/** Intrinsic image size must come from project media, never from the guide's authored frame. */
export function generateTourFromGuide(
  project: GuideProject,
  resolveMaterial: (
    block: GuideImageBlock
  ) => Omit<TourMaterial, 'title' | 'description' | 'origin'> | null,
  textOnly: 'navigation' | 'report',
  nextId: () => string = () => crypto.randomUUID()
): TourGenerationProposal {
  const tour = createTourDocument(nextId());
  const issues: TourGenerationIssue[] = [];
  let chapter: TourNavigationSlide | null = null;
  for (const item of project.items) {
    if (item.kind === 'section') {
      chapter = {
        kind: 'navigation',
        id: nextId(),
        title: item.title,
        description: boundedText(paragraphsText(item.paragraphs), item.id, issues),
        background: { color: tour.stage.background, image: null },
        buttons: [],
        narration: null,
        timing: createTourImageSlide('timing').timing,
      };
      tour.slides.push(chapter);
      continue;
    }
    const images = item.blocks.filter((block) => block.kind === 'image');
    const description = item.blocks
      .map((block) => {
        if (block.kind === 'text' || block.kind === 'note') return paragraphsText(block.paragraphs);
        if (block.kind === 'heading') return block.text;
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
    if (!images.length) {
      issues.push({ kind: 'text-only', sourceId: item.id });
      if (textOnly === 'navigation')
        tour.slides.push({
          kind: 'navigation',
          id: nextId(),
          title: item.title,
          description: boundedText(description, item.id, issues),
          background: { color: tour.stage.background, image: null },
          buttons: [],
          narration: null,
          timing: createTourImageSlide('timing').timing,
        });
    }
    for (const block of images) {
      const material = resolveMaterial(block);
      if (
        !material ||
        material.image.assetId !== block.assetId ||
        material.image.editDocumentId !== block.editDocumentId
      ) {
        issues.push({ kind: 'missing-image', sourceId: block.id });
        continue;
      }
      const slide = materialSlide(
        {
          ...material,
          image: {
            ...material.image,
            source: structuredClone(block.source),
            galleryAssetId: block.galleryAssetId,
            alt: block.alt,
          },
          title: item.title,
          description: [description, block.caption].filter(Boolean).join('\n\n'),
          origin: { stepId: item.id, blockId: block.id },
        },
        issues,
        nextId
      );
      tour.slides.push(slide);
      if (chapter)
        chapter.buttons.push({
          id: nextId(),
          label: item.title,
          action: { kind: 'slide', slideId: slide.id },
        });
    }
  }
  return validate({ tour, issues });
}
