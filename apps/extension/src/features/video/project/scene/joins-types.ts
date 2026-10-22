import type { CompositionJoinSettings } from './composition-join';

interface JoinSourceRange {
  assetId: string;
  sourceInstanceId: string;
  start: number;
  end: number;
}

/** Clip edges own active timing. Source ranges retain original cut intent without an anchor. */
export type VideoProjectCompositionJoin = {
  id: string;
  transition?: CompositionJoinSettings;
} & (
  | { clipId: string; edge: 'start' | 'end'; sampling?: never; sourceRange?: never }
  | { clipId: string; edge: 'start' | 'end'; sampling: 'cut'; sourceRange?: JoinSourceRange }
  | { clipId?: never; edge?: never; sampling: 'cut'; sourceRange: JoinSourceRange }
);

/** Derived project-clock regions; output cadence belongs to the sample adapter. */
export interface VideoProjectCompositionJoinPlan {
  boundary: VideoProjectCompositionJoin;
  seam: number;
  before: number;
  after: number;
  outgoingStart: number;
  incomingEnd: number;
}
