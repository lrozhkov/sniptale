/** A decoded frame represents this exclusive source interval in the filmstrip. */
interface TimelinePreviewFrameInterval {
  sourceStart: number;
  sourceEnd: number;
  url: string;
}

export type TimelineClipPreview =
  | { kind: 'image'; url: string }
  | { kind: 'video'; frames: readonly TimelinePreviewFrameInterval[] };

export type TimelineClipPreviewMap = Record<string, TimelineClipPreview>;

export interface TimelinePreviewViewport {
  endTime: number;
  startTime: number;
  pixelsPerSecond: number;
}
