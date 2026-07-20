import type { Canvas } from 'fabric';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../features/editor/document/types';

import type { SourceState } from '../../../document/model/source-state';
import {
  resolveEditorSceneLayout,
  shouldFitSourceToContent,
  shouldPreserveCanvasForBrowserFrame,
} from '../../../browser-frame/layout';
import { isBrowserFrameObject } from '../../../document/model';
import type { SceneRelayoutOptions } from './types';

function hasBrowserFrameLayer(canvas: Canvas): boolean {
  return canvas.getObjects().some((object) => isBrowserFrameObject(object));
}

export function resolveRelayoutSceneGeometry(args: {
  canvas: Canvas;
  source: SourceState;
  canvasDocumentSize: { width: number; height: number };
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
  options: SceneRelayoutOptions;
}) {
  const hasBrowserFrame = args.options.hasBrowserFrame ?? hasBrowserFrameLayer(args.canvas);

  return resolveEditorSceneLayout({
    frame: args.frame,
    browserFrame: args.browserFrame,
    hasBrowserFrame,
    source: {
      width: args.options.sourceSize?.width ?? args.source.displayWidth,
      height: args.options.sourceSize?.height ?? args.source.displayHeight,
    },
    canvas: args.options.canvasSize ?? args.canvasDocumentSize,
    preserveCanvasSize:
      args.options.preserveCanvasSize ??
      shouldPreserveCanvasForBrowserFrame(args.frame, args.browserFrame, hasBrowserFrame),
    fitSourceToContent:
      args.options.fitSourceToContent ??
      shouldFitSourceToContent(args.frame, args.browserFrame, hasBrowserFrame),
  });
}
