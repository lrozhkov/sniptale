import { FabricImage } from 'fabric';
import type {
  BrowserFrameState,
  EditorDocument,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import {
  resolveEditorSceneLayout,
  shouldFitSourceToContent,
  shouldPreserveCanvasForBrowserFrame,
} from '../../browser-frame/layout';
import { getFabricImageIntrinsicSize } from '../../document/model';
import { emptyCanvasJson } from '../core/helpers';

export async function createBaseDocument(
  dataUrl: string,
  sourceName: string | null,
  frame: EditorFrameSettings,
  browserFrame: BrowserFrameState
): Promise<EditorDocument> {
  const image = await FabricImage.fromURL(dataUrl);
  const { width: sourceWidth, height: sourceHeight } = getFabricImageIntrinsicSize(image);
  const layout = resolveEditorSceneLayout({
    frame,
    browserFrame,
    hasBrowserFrame: false,
    source: { width: sourceWidth, height: sourceHeight },
    canvas: {
      width: frame.paddingLeft + sourceWidth + frame.paddingRight,
      height: frame.paddingTop + sourceHeight + frame.paddingBottom,
    },
    preserveCanvasSize: shouldPreserveCanvasForBrowserFrame(frame, browserFrame, false),
    fitSourceToContent: shouldFitSourceToContent(frame, browserFrame, false),
  });

  return {
    version: 1,
    sourceImageData: dataUrl,
    sourceName,
    sourceWidth,
    sourceHeight,
    canvasWidth: layout.canvas.width,
    canvasHeight: layout.canvas.height,
    sourceLeft: layout.source.left,
    sourceTop: layout.source.top,
    sourceDisplayWidth: layout.source.width,
    sourceDisplayHeight: layout.source.height,
    frame,
    browserFrame,
    canvasJson: emptyCanvasJson(),
  };
}
