export type VideoEditorMoveClipAction = (
  clipId: string,
  startTime: number,
  trackId?: string,
  timelineLaneId?: string | null
) => void;
