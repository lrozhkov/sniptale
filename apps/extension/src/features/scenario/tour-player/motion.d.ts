import type { TourDocument, TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
interface VisualSnapshot {
  pixels: HTMLElement;
  point: { x: number; y: number } | null;
}
export function createTourMotion(
  root: HTMLElement,
  signal: AbortSignal
): {
  capture(): VisualSnapshot | null;
  prepare(
    previous: VisualSnapshot | null,
    slide: TourSlide | null,
    tour: TourDocument,
    viewport: { stageWidth: number; stageHeight: number },
    reducedMotion: boolean
  ): void;
  ready(): void;
  frame(elapsed: number): void;
  cancel(options?: { preserveMediaGate?: boolean }): void;
  fail(): void;
};
