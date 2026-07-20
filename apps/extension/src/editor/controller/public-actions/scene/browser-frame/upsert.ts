import type { BrowserFrameState } from '../../../../../features/editor/document/types';
import { createBrowserFrameLayerObject } from '../../../../objects/browser-frame';
import { readCurrentBrowserFrameSourceState } from '../../../browser-frame/source-state';
import { findBrowserFrameLayer, replaceBrowserFrameLayer } from './layer';
import {
  resolveBrowserFrameRelayoutOptions,
  resolveBrowserFrameScene,
  resolveNextBrowserFramePosition,
  resolveNextBrowserFrameWidth,
} from './layout';
import type { BrowserFrameActionOptions } from './types';

export async function upsertBrowserFrameLayer(
  options: BrowserFrameActionOptions,
  browserFrame: BrowserFrameState
): Promise<boolean> {
  const { canvas } = options;
  if (!canvas) {
    return false;
  }

  const existingLayer = findBrowserFrameLayer(canvas);
  const currentSource = readCurrentBrowserFrameSourceState(canvas, options.source);
  if (!currentSource) {
    return false;
  }
  const relayoutOptions = resolveBrowserFrameRelayoutOptions(browserFrame);
  const nextScene = resolveBrowserFrameScene({
    browserFrame,
    currentSource,
    options,
    relayoutOptions,
  });
  const position = resolveNextBrowserFramePosition({
    currentSource,
    existingLayer,
    nextSource: nextScene.source,
  });

  const nextLayer = await createBrowserFrameLayerObject({
    browserFrame,
    existingObject: existingLayer,
    left: position.left,
    nextLabelIndex: options.nextLabelIndex?.('browser-frame') ?? 1,
    prepareObject: options.prepareObject ?? (() => undefined),
    top: position.top,
    width: resolveNextBrowserFrameWidth({
      currentSource,
      existingLayer,
      nextSource: nextScene.source,
    }),
  });

  options.relayoutScene(browserFrame, relayoutOptions);
  replaceBrowserFrameLayer(canvas, existingLayer, nextLayer);
  options.ensureBrowserFrameOnTop();
  canvas.requestRenderAll();
  return true;
}
