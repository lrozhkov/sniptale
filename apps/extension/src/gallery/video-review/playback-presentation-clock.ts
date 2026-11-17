import { createContext } from 'react';

/** Sample manual-preview chrome separately from rendering and playhead frame cadence. */
export const REVIEW_PLAYBACK_UI_INTERVAL_MS = 100;

/** Read-only display clock. The transport owns publication and source validation. */
export interface ReviewPlaybackPresentationClock {
  read(): number;
  /** Available when transport inserts project time without advancing the source. */
  readResult?(): number | null;
  isPlaying(): boolean;
  subscribe(listener: () => void): () => void;
}

export const ReviewPlaybackPresentationClockContext =
  createContext<ReviewPlaybackPresentationClock | null>(null);
