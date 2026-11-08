import type { EditorCompositionBase } from '../../../../features/editor/document/types';
export interface SceneRelayoutOptions {
  compositionBase?: EditorCompositionBase;
  canvasSize?: { width: number; height: number };
  sourceSize?: { width: number; height: number };
  preserveCanvasSize?: boolean;
  fitSourceToContent?: boolean;
  hasBrowserFrame?: boolean;
}
