import type { TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
/** Actual narration state and the one disposable viewer master shared by audio channels. */
interface TourAudioSnapshot {
  slideId: string | null;
  objectId: string | null;
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'blocked' | 'error';
  canResume: boolean;
  volume: number;
  muted: boolean;
  audible: boolean;
}
/** Disposable narration projection of the player clock and explicit local commands. */
export function createTourAudio(
  root: HTMLElement,
  signal: AbortSignal,
  failed: (state: 'blocked' | 'audio-error') => void,
  changed?: (snapshot: TourAudioSnapshot) => void
): {
  readonly snapshot: TourAudioSnapshot;
  show(slide: TourSlide | null, assets: { id: string; src: string }[]): void;
  sync(seconds: number, playing: boolean): void;
  activate(id: string): void;
  replay(objectId: string | null): void;
  pause(): void;
  resume(): void;
  setVolume(value: number): void;
  setMuted(value: boolean): void;
  stop(): void;
};
