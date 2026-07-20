import {
  shouldFitSourceToContent,
  shouldPreserveCanvasForBrowserFrame,
} from '../../../../browser-frame/layout';
import { MIN_CANVAS_SIZE } from '../../../../document/model';

import { hasBrowserFrameLayer } from './browser-frame';
import { finalizeSceneResizeMutation } from './finalize';
import type { SourceResizeSceneOptions } from './types';

export function resizeEditorSourceScene(options: SourceResizeSceneOptions): void {
  const { canvas, source, width, height } = options;
  if (!canvas || !source) {
    return;
  }

  const nextWidth = Math.max(MIN_CANVAS_SIZE, Math.round(width));
  const nextHeight = Math.max(MIN_CANVAS_SIZE, Math.round(height));
  const frame = options.store.getFrame();
  const browserFrame = options.store.getBrowserFrame();
  const hasBrowserFrame = hasBrowserFrameLayer(canvas);

  options.relayoutScene(frame, browserFrame, {
    sourceSize: { width: nextWidth, height: nextHeight },
    preserveCanvasSize: shouldPreserveCanvasForBrowserFrame(frame, browserFrame, hasBrowserFrame),
    fitSourceToContent: shouldFitSourceToContent(frame, browserFrame, hasBrowserFrame),
  });

  finalizeSceneResizeMutation(options);
}
