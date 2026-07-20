import type { Canvas } from 'fabric';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../features/editor/document/types';

import type { SourceState } from '../../../document/model/source-state';
import { syncManagedBackgroundLayerLayout } from '../../background';
import { updateUserObjectLayout } from '../scene-object-layout';
import { resolveRelayoutSceneGeometry } from './layout';
import { resolveRelayoutSourceState } from './source-state';
import type { SceneRelayoutOptions } from './types';

interface SceneRelayoutResult {
  canvasSize: { width: number; height: number };
  source: SourceState;
}

export function relayoutEditorScene(
  canvas: Canvas | null,
  source: SourceState | null,
  canvasDocumentSize: { width: number; height: number },
  frame: EditorFrameSettings,
  browserFrame: BrowserFrameState,
  options: SceneRelayoutOptions = {}
): SceneRelayoutResult | null {
  if (!canvas || !source) {
    return null;
  }

  const layout = resolveRelayoutSceneGeometry({
    browserFrame,
    canvas,
    canvasDocumentSize,
    frame,
    options,
    source,
  });
  const currentSource = { ...source };
  syncManagedBackgroundLayerLayout({
    canvas,
    canvasSize: {
      height: layout.canvas.height,
      width: layout.canvas.width,
    },
    frame,
  });
  updateUserObjectLayout({
    canvas,
    currentSource,
    sourceSizeChanged:
      options.sourceSize !== undefined &&
      (layout.source.width !== currentSource.displayWidth ||
        layout.source.height !== currentSource.displayHeight),
    layoutSource: layout.source,
  });
  const nextSource = resolveRelayoutSourceState(canvas, currentSource, layout.source);

  return {
    canvasSize: {
      width: layout.canvas.width,
      height: layout.canvas.height,
    },
    source: nextSource,
  };
}
