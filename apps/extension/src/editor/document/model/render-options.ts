export interface EditorRenderedImageSize {
  width: number;
  height: number;
}

export interface EditorRenderedImageOptions {
  outputSize?: EditorRenderedImageSize;
}

export interface EditorRenderToDataUrlOptions extends EditorRenderedImageOptions {
  /** Cancels dispensable rendering; never used to abort a durable document commit. */
  signal?: AbortSignal;
  format: 'png' | 'jpeg' | 'webp';
  quality: number;
}
