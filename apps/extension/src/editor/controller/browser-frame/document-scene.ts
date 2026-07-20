import type { Canvas } from 'fabric';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import { relayoutEditorScene } from '../document/scene/relayout';

import type { SourceState } from '../../document/model/source-state';

export function relayoutEditorControllerScene(options: {
  canvas: Canvas | null;
  source: SourceState | null;
  canvasDocumentSize: { width: number; height: number };
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
  sceneOptions?: {
    canvasSize?: { width: number; height: number };
    sourceSize?: { width: number; height: number };
    preserveCanvasSize?: boolean;
    fitSourceToContent?: boolean;
    hasBrowserFrame?: boolean;
  };
}): { source: SourceState; canvasSize: { width: number; height: number } } | null {
  const nextScene = relayoutEditorScene(
    options.canvas,
    options.source,
    options.canvasDocumentSize,
    options.frame,
    options.browserFrame,
    options.sceneOptions
  );
  if (!nextScene || !options.canvas) {
    return null;
  }

  options.canvas.setDimensions(nextScene.canvasSize);
  return {
    source: nextScene.source,
    canvasSize: nextScene.canvasSize,
  };
}
