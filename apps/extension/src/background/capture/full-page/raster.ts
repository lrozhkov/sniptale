export interface FullPageRasterBackend {
  captureFrame(signal?: AbortSignal): Promise<string>;
  release(): Promise<void>;
}
