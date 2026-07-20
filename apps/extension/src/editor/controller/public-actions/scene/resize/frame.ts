import {
  shouldFitSourceToContent,
  shouldPreserveCanvasForBrowserFrame,
} from '../../../../browser-frame/layout';

import { hasBrowserFrameLayer } from './browser-frame';
import { finalizeSceneResizeMutation } from './finalize';
import { doesFrameGeometryChange } from './frame-geometry';
import type { FrameSceneSettingsOptions } from './types';

export function applyEditorFrameSceneSettings(options: FrameSceneSettingsOptions): void {
  const { canvas, source, frame } = options;
  if (!canvas || !source) {
    return;
  }

  const browserFrame = options.store.getBrowserFrame();
  const hasBrowserFrame = hasBrowserFrameLayer(canvas);
  if (doesFrameGeometryChange(options.store.getFrame(), frame)) {
    options.relayoutScene(frame, browserFrame, {
      preserveCanvasSize: shouldPreserveCanvasForBrowserFrame(frame, browserFrame, hasBrowserFrame),
      fitSourceToContent: shouldFitSourceToContent(frame, browserFrame, hasBrowserFrame),
    });
  }

  options.store.updateFrame(frame);
  finalizeSceneResizeMutation(options);
}
