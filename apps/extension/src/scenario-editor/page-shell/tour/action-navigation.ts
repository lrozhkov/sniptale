import {
  getTourSlideObjects,
  type TourDocument,
  type TourSlide,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import type { TourSelection } from './selection';

function actions(slide: TourSlide): string[] {
  return slide.kind === 'image'
    ? getTourSlideObjects(slide).flatMap((entry) =>
        entry.type === 'mask' ? [] : [entry.object.id]
      )
    : slide.buttons.map((button) => button.id);
}

/** Navigation follows current authored order; empty slides remain an explicit stop. */
export function tourActionTarget(
  tour: TourDocument,
  selection: TourSelection | null,
  direction: -1 | 1
): Extract<TourSelection, { kind: 'slide' }> | null {
  if (selection?.kind !== 'slide') return null;
  const index = tour.slides.findIndex((slide) => slide.id === selection.slideId);
  const slide = tour.slides[index];
  if (!slide) return null;
  const ids = actions(slide);
  const actionIndex = Math.max(0, ids.indexOf(selection.objectId ?? ''));
  const objectId = ids[actionIndex + direction];
  if (objectId) return { kind: 'slide', slideId: slide.id, objectId };
  const adjacent = tour.slides[index + direction];
  if (!adjacent) return null;
  const adjacentIds = actions(adjacent);
  return {
    kind: 'slide',
    slideId: adjacent.id,
    objectId: (direction > 0 ? adjacentIds[0] : adjacentIds.at(-1)) ?? null,
  };
}
