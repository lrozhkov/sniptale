import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import {
  shouldFitSourceForBrowserTransition,
  shouldPreserveCanvasForBrowserTransition,
} from '../document/scene/transition';
import { type SceneRelayoutOptions } from '../document/scene/types';
import type { BrowserFrameTransitionOwnerContext, EditorBrowserFrameContext } from './types';

function getViewportDevicePixelRatioBaselinePatch(viewportDevicePixelRatioBaseline?: number) {
  return viewportDevicePixelRatioBaseline === undefined ? {} : { viewportDevicePixelRatioBaseline };
}

export function createEditorBrowserFrameContext(
  options: BrowserFrameTransitionOwnerContext
): EditorBrowserFrameContext | null {
  if (!options.canvas || !options.source) {
    return null;
  }

  return {
    canvas: options.canvas,
    source: options.source,
    canvasDocumentSize: options.canvasDocumentSize,
    zoomLevel: options.zoomLevel,
    ...getViewportDevicePixelRatioBaselinePatch(options.viewportDevicePixelRatioBaseline),
    frame: options.frame,
    currentBrowserFrame: options.currentBrowserFrame,
    applyFrameDecorations: options.applyFrameDecorations,
    relayoutScene: options.relayoutScene,
    prepareFrameDecorations: options.prepareFrameDecorations,
    setBrowserFrame: options.setBrowserFrame,
    rebuildFrameDecorations: options.rebuildFrameDecorations,
    ensureReachableObjects: options.ensureReachableObjects,
    ensureBrowserFrameOnTop: options.ensureBrowserFrameOnTop,
    logBrowserFrame: options.logBrowserFrame,
  };
}

export function createBrowserFrameRelayoutOptions(args: {
  frame: EditorFrameSettings;
  currentBrowserFrame: BrowserFrameState;
  nextBrowserFrame: BrowserFrameState;
}): SceneRelayoutOptions {
  const { frame, currentBrowserFrame, nextBrowserFrame } = args;

  return {
    preserveCanvasSize: shouldPreserveCanvasForBrowserTransition(
      frame,
      currentBrowserFrame,
      nextBrowserFrame
    ),
    fitSourceToContent: shouldFitSourceForBrowserTransition(
      frame,
      currentBrowserFrame,
      nextBrowserFrame
    ),
  };
}
