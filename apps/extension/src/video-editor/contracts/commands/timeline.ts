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
