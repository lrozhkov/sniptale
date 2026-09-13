import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { TOUR_LIMITS } from '@sniptale/runtime-contracts/scenario/types/tour';
import {
  createTourDocument,
  generateTourFromMaterials,
  remapTourImageGeometry,
  type TourMaterial,
} from '../../../../features/scenario/project/public';

export type TourImageImportPlacement =
  | { kind: 'tour-slides'; beforeSlideId?: string }
  | { kind: 'tour-image'; slideId: string }
  | { kind: 'tour-background'; slideId: string };

export function isTourImageImportPlacement(value: {
  kind: string;
}): value is TourImageImportPlacement {
  return (
    value.kind === 'tour-slides' || value.kind === 'tour-image' || value.kind === 'tour-background'
  );
}

/** Placement admission before the shared import transaction allocates any bytes. */
export function admitTourImageImport(
  project: GuideProject,
  placement: TourImageImportPlacement,
  count: number
): void {
  if (project.purpose === 'step-template') throw new Error('Step templates cannot contain tours.');
  if (placement.kind === 'tour-slides') {
    const slides = project.tour?.slides ?? [];
    if (slides.length + count > TOUR_LIMITS.maxSlides)
      throw new Error('The tour has reached its slide limit.');
    if (
      placement.beforeSlideId !== undefined &&
      !slides.some((slide) => slide.id === placement.beforeSlideId)
    )
      throw new Error('The tour insertion position is unavailable.');
    project.tour ??= createTourDocument();
    return;
  }
  const slide = project.tour?.slides.find((entry) => entry.id === placement.slideId);
  const expected = placement.kind === 'tour-image' ? 'image' : 'navigation';
  if (count !== 1 || slide?.kind !== expected)
    throw new Error('The selected tour image is unavailable.');
}

/** Pure placement only; resource acquisition/publication remains in the shared import transaction. */
export function placeTourImportedImage(
  project: GuideProject,
  placement: TourImageImportPlacement,
  material: TourMaterial
): void {
  const tour = project.tour;
  if (!tour) throw new Error('The tour is unavailable.');
  if (placement.kind === 'tour-slides') {
    const proposal = generateTourFromMaterials([material]);
    if (proposal.issues.some((issue) => issue.kind === 'text-overflow'))
      throw new Error('Tour text exceeds the slide limit.');
    const index =
      placement.beforeSlideId === undefined
        ? tour.slides.length
        : tour.slides.findIndex((slide) => slide.id === placement.beforeSlideId);
    if (index < 0) throw new Error('The tour insertion position is unavailable.');
    tour.slides.splice(index, 0, ...proposal.tour.slides);
    return;
  }
  const slide = tour.slides.find((entry) => entry.id === placement.slideId);
  if (slide?.kind === 'image' && placement.kind === 'tour-image') {
    const geometry = remapTourImageGeometry(slide, null);
    Object.assign(slide, geometry.slide, { image: structuredClone(material.image) });
  } else if (slide?.kind === 'navigation' && placement.kind === 'tour-background')
    slide.background.image = structuredClone(material.image);
  else throw new Error('The selected tour image is unavailable.');
}
