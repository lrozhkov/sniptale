import type { TourDocument, TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
export function tourSlideDuration(tour: TourDocument, slide: TourSlide): number;
export function tourAutoplayDestination(tour: TourDocument, index: number): number | null;
export function tourLinearTimeline(
  tour: TourDocument,
  reducedMotion?: boolean
): { offsets: number[]; duration: number } | null;

export function tourEntranceTiming(
  tour: TourDocument,
  slide: TourSlide | null,
  reducedMotion?: boolean
): { switchMs: number; travelMs: number; total: number };
