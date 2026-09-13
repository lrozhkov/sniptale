import type { TourDocument, TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
export function tourSlideDuration(tour: TourDocument, slide: TourSlide): number;
export function tourAutoplayDestination(tour: TourDocument, index: number): number | null;
export function tourLinearTimeline(
  tour: TourDocument
): { offsets: number[]; duration: number } | null;
