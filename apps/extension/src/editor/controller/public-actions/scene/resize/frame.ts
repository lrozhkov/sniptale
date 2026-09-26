import { normalizeEditorImageSettings } from '../../../../../features/editor/document/constants';
import { applyImageSettings } from '../../../../objects/image-style';
import { getSourceObject } from '../../../document/layers';
import {
  shouldFitSourceToContent,
  shouldPreserveCanvasForBrowserFrame,
} from '../../../../browser-frame/layout';

import { finalizeSceneResizeMutation } from './finalize';
import { doesFrameGeometryChange, hasBrowserFrameLayer } from './geometry';
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

  const sourceObject = getSourceObject(canvas);
  const currentStyle = normalizeEditorImageSettings(options.store.getFrame().sourceImage);
  const nextStyle = normalizeEditorImageSettings(frame.sourceImage);
  const styleChanged = Object.entries(nextStyle).some(
    ([key, value]) => Reflect.get(currentStyle, key) !== value
  );
  if (sourceObject && styleChanged) applyImageSettings(sourceObject, nextStyle);
  options.store.updateFrame(frame);
  finalizeSceneResizeMutation(options);
}
