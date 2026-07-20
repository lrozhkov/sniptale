import { shouldFitSourceToContent } from '../../../../browser-frame/layout';
import { MIN_CANVAS_SIZE } from '../../../../document/model';

import { hasBrowserFrameLayer } from './browser-frame';
import { finalizeSceneResizeMutation } from './finalize';
import type { CanvasResizeSceneOptions } from './types';

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
