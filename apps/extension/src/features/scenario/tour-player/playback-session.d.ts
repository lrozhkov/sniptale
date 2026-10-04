import type { createTourMotion } from './motion.js';

type SessionState = 'empty' | 'loading' | 'ready' | 'error';
type SessionMode = 'manual' | 'playback';
interface PlaybackSpec {
  duration: number;
  entrance: number;
  exitStart?: number;
  source?: string;
  required?: boolean;
}
interface Departure {
  complete(): void;
  cancel(): void;
}
/** Owns one media-gated timeline and cancellable departure on the same clock. */
export function createTourPlaybackSession(options: {
  signal: AbortSignal;
  motion: Pick<
    ReturnType<typeof createTourMotion>,
    'frame' | 'exit' | 'cancelExit' | 'ready' | 'fail' | 'cancel'
  >;
  hidden(): boolean;
  autoplay: boolean;
  changed(
    elapsed: number,
    playing: boolean,
    state: SessionState,
    mode: SessionMode,
    continuous: boolean
  ): void;
  complete(): void;
}): {
  load(spec: PlaybackSpec): void;
  depart(callbacks: Departure): void;
  pause(): void;
  play(): void;
  clear(): void;
  setManual(): void;
  seek(elapsed: number): void;
  readonly mode: SessionMode;
  readonly elapsed: number;
  readonly playing: boolean;
  readonly continuous: boolean;
  readonly state: SessionState;
};
