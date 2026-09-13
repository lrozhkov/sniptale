import type { TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
/** Disposable narration projection of the player clock and explicit object activation. */
export function createTourAudio(
  root: HTMLElement,
  signal: AbortSignal,
  failed: (state: 'blocked' | 'error') => void
): {
  show(slide: TourSlide | null, assets: { id: string; src: string }[]): void;
  sync(seconds: number, playing: boolean): void;
  activate(id: string): void;
  stop(): void;
};
