import type { WindowHeader } from '@sniptale/runtime-contracts/window-header';
import type { TourImageSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
/** The current stage supplies its dimensions and optional global decoration. */
export interface TourImageViewport {
  stageWidth: number;
  stageHeight: number;
  windowHeader?: WindowHeader | undefined;
}
interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Projects the decorated window independently of the camera and source placement. */
export function resolveTourImageFrame(
  slide: TourImageSlide,
  viewport: TourImageViewport
): {
  window: FrameRect;
  content: FrameRect;
  header: FrameRect | null;
};
