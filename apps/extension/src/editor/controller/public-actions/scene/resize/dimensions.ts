import {
  shouldFitSourceToContent,
  shouldPreserveCanvasForBrowserFrame,
} from '../../../../browser-frame/layout';
import { MIN_CANVAS_SIZE } from '../../../../document/model';

import { finalizeSceneResizeMutation } from './finalize';
import { hasBrowserFrameLayer } from './geometry';
import type { CanvasResizeSceneOptions, SourceResizeSceneOptions } from './types';

export function resizeEditorCanvasScene(options: CanvasResizeSceneOptions): void {
  const { canvas, source, width, height, setCanvasDocumentSize } = options;
  if (!canvas) {
    return;
  }

  const nextCanvasSize = {
    width: Math.max(MIN_CANVAS_SIZE, Math.round(width)),
    height: Math.max(MIN_CANVAS_SIZE, Math.round(height)),
  };
  const hasBrowserFrame = hasBrowserFrameLayer(canvas);

  if (source) {
    options.relayoutScene(options.store.getFrame(), options.store.getBrowserFrame(), {
      canvasSize: nextCanvasSize,
      preserveCanvasSize: true,
      fitSourceToContent: shouldFitSourceToContent(
        options.store.getFrame(),
        options.store.getBrowserFrame(),
        hasBrowserFrame
      ),
    });
  } else {
    setCanvasDocumentSize(nextCanvasSize);
    canvas.setDimensions(nextCanvasSize);
  }

  finalizeSceneResizeMutation(options);
}

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
