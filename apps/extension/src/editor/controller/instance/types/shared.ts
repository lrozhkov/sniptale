export type EditorControllerDocumentSize = {
  width: number;
  height: number;
};

export type EditorControllerRelayoutOptions = {
  canvasSize?: EditorControllerDocumentSize;
  sourceSize?: EditorControllerDocumentSize;
  preserveCanvasSize?: boolean;
  fitSourceToContent?: boolean;
};
