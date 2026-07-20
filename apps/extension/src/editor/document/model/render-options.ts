export interface EditorRenderedImageSize {
  width: number;
  height: number;
}

export interface EditorRenderedImageOptions {
  outputSize?: EditorRenderedImageSize;
}

export interface EditorRenderToDataUrlOptions extends EditorRenderedImageOptions {
  format: 'png' | 'jpeg' | 'webp';
  quality: number;
}
