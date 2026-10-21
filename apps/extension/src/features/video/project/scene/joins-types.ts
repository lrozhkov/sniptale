import type { CompositionJoinSettings } from './composition-join';

/** A whole-frame boundary follows one ordinary media clip edge, never a neighbour search. */
export interface VideoProjectCompositionJoin {
  id: string;
  clipId: string;
  edge: 'start' | 'end';
  /** Omission retains an unprocessed boundary and its limits for adjacent joins. */
  transition?: CompositionJoinSettings;
}

/** Derived project-clock regions; output cadence belongs to the sample adapter. */
export interface VideoProjectCompositionJoinPlan {
  boundary: VideoProjectCompositionJoin;
  seam: number;
  before: number;
  after: number;
  outgoingStart: number;
  incomingEnd: number;
}
