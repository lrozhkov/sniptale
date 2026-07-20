export interface CaptureScreenshotResult {
  data: string;
}

export type FullPageCaptureOptions = {
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
};

export type CapturePart = {
  captureHeight: number;
  dataUrl: string;
  offsetY: number;
};
