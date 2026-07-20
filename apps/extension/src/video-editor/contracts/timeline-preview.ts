export interface TimelineClipPreview {
  kind: 'image' | 'video';
  urls: readonly string[];
}

export type TimelineClipPreviewMap = Record<string, TimelineClipPreview>;

export interface TimelinePreviewViewport {
  endTime: number;
  startTime: number;
}
