import type { BrowserFrameState } from '../../../features/editor/document/types';
import { resolveEditorSceneLayout } from '../../browser-frame/layout';
import { applyEditorViewportZoom } from '../viewport';
import { createBrowserFrameRelayoutOptions } from './params';
import type { BrowserFrameTransitionContext } from './types';

function resolveNextBrowserFrameScene(
  context: BrowserFrameTransitionContext,
  nextBrowserFrame: BrowserFrameState
) {
  const relayoutOptions = createBrowserFrameRelayoutOptions({
    frame: context.frame,
    currentBrowserFrame: context.currentBrowserFrame,
    nextBrowserFrame,
  });
  const layout = resolveEditorSceneLayout({
    frame: context.frame,
    browserFrame: nextBrowserFrame,
    hasBrowserFrame: true,
    source: {
      width: context.source.displayWidth,
      height: context.source.displayHeight,
    },
    canvas: context.canvasDocumentSize,
    preserveCanvasSize: relayoutOptions.preserveCanvasSize ?? false,
    fitSourceToContent: relayoutOptions.fitSourceToContent ?? false,
  });

  return {
    relayoutOptions,
    canvasSize: layout.canvas,
    source: {
      ...context.source,
      left: layout.source.left,
      top: layout.source.top,
      displayWidth: layout.source.width,
      displayHeight: layout.source.height,
    },
  };
}

export async function runBrowserFrameTransition(
  context: BrowserFrameTransitionContext,
  nextBrowserFrame: BrowserFrameState,
  ensureFrameOnTop: boolean
): Promise<boolean> {
  const { canvas, canvasDocumentSize, zoomLevel } = context;
  const nextScene = resolveNextBrowserFrameScene(context, nextBrowserFrame);
  const preparedDecorations = await context.prepareFrameDecorations(
    nextBrowserFrame,
    nextScene.canvasSize,
    nextScene.source
  );

  if (!preparedDecorations) {
    return false;
  }

  if (
    !context.applyFrameDecorations(preparedDecorations.prepared, preparedDecorations.renderToken)
  ) {
    return false;
  }

  context.relayoutScene(nextBrowserFrame, nextScene.relayoutOptions);

  context.setBrowserFrame(nextBrowserFrame);
  applyEditorViewportZoom(
    canvas,
    canvasDocumentSize,
    zoomLevel,
    context.viewportDevicePixelRatioBaseline
  );
  context.ensureReachableObjects();
  if (ensureFrameOnTop) {
    context.ensureBrowserFrameOnTop();
  }
  canvas.requestRenderAll();
  return true;
}
