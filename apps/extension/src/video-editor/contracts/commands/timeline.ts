export interface VideoEditorClipTimingResult {
  clipId: string;
  duration: number;
  endTime: number;
  startTime: number;
  timelineLaneId: string | null;
  trackId: string;
}

export type VideoEditorMoveClipAction = (
  clipId: string,
  startTime: number,
  trackId?: string,
  timelineLaneId?: string | null
) => VideoEditorClipTimingResult | null;

export type VideoEditorTrimClipAction = (
  clipId: string,
  edgeTime: number
) => VideoEditorClipTimingResult | null;

/** Identity of one captured typing interval as it appears in a particular clip. */
export interface VideoEditorTypingSpanTarget {
  recordingId: string;
  sourceInstanceId: string;
  signalId: string;
  clipId: string;
}

export interface VideoEditorTypingCompressionRequest extends VideoEditorTypingSpanTarget {
  targetPlaybackRate: number;
}

export type VideoEditorTypingCompressionResult =
  | { status: 'applied'; clipId: string }
  | { status: 'stale' | 'blocked' | 'unchanged' };
