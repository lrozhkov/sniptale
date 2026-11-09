import type { Canvas } from 'fabric';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../features/editor/document/types';
import type { SourceState } from '../../../document/model/source-state';
import { isBrowserFrameObject } from '../../../document/model';
import { resolveSceneComposition, resolveSceneCompositionBase } from './composition';
import type { SceneRelayoutOptions } from './types';

export function resolveRelayoutSceneGeometry(args: {
  canvas: Canvas;
  source: SourceState;
  canvasDocumentSize: { width: number; height: number };
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
  options: SceneRelayoutOptions;
}) {
  const hasBrowserFrame =
    args.options.hasBrowserFrame ?? args.canvas.getObjects().some(isBrowserFrameObject);
  const base =
    args.options.compositionBase ??
    resolveSceneCompositionBase({
      source: args.source,
      canvasSize: args.canvasDocumentSize,
      frame: args.frame,
      browserFrame: args.browserFrame,
      hasBrowserFrame,
    });
  return resolveSceneComposition({
    base,
    frame: args.frame,
    browserFrame: args.browserFrame,
    hasBrowserFrame,
    options: args.options,
  });
}
