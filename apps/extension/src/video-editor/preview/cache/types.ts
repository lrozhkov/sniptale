export interface PreparedCachedVideoPreview {
  codec: string;
  endTime: number;
  mimeType: string;
  segments: Blob[];
  startTime: number;
}
