export interface SceneRelayoutOptions {
  canvasSize?: { width: number; height: number };
  sourceSize?: { width: number; height: number };
  preserveCanvasSize?: boolean;
  fitSourceToContent?: boolean;
  hasBrowserFrame?: boolean;
}
