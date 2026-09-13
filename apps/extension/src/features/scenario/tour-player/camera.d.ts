import type { TourImageSlide, TourPoint } from '@sniptale/runtime-contracts/scenario/types/tour';

interface TourImageProjection {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
  center: TourPoint;
}

export function resolveTourCamera(
  slide: TourImageSlide,
  viewport: { stageWidth: number; stageHeight: number },
  autoZoom: boolean
): TourImageProjection | null;

export function resolveTourEditingCamera(
  slide: TourImageSlide,
  viewport: { stageWidth: number; stageHeight: number }
): TourImageProjection | null;
export function tourCameraEnabled(slide: TourImageSlide | null, autoZoom: boolean): boolean;
