import type { FabricObject } from 'fabric';
import type { BrowserFrameState } from '../../../../../features/editor/document/types';
import { resolveEditorSceneLayout } from '../../../../browser-frame/layout';
import { BROWSER_HEADER_HEIGHT } from '../../../../document/model';

import type { SourceState } from '../../../../document/model/source-state';
import type { RelayoutOptions } from '../helpers';
import type { BrowserFrameActionOptions } from './types';
import { resolveBrowserFrameWidth } from './layer';

export function hasBrowserFrameSourceSizeChange(args: {
  currentSource: SourceState;
  nextSource: { width: number; height: number };
}) {
  return (
    args.nextSource.width !== args.currentSource.displayWidth ||
    args.nextSource.height !== args.currentSource.displayHeight
  );
}

export function resolveNextBrowserFramePosition(args: {
  currentSource: SourceState;
  existingLayer: FabricObject | null;
  nextSource: { left: number; top: number };
}) {
  if (!args.existingLayer) {
    return {
      left: args.nextSource.left,
      top: Math.max(0, args.nextSource.top - BROWSER_HEADER_HEIGHT),
    };
  }

  return {
    left:
      (args.existingLayer.left ?? args.currentSource.left) +
      (args.nextSource.left - args.currentSource.left),
    top:
      (args.existingLayer.top ?? Math.max(0, args.currentSource.top - BROWSER_HEADER_HEIGHT)) +
      (args.nextSource.top - args.currentSource.top),
  };
}

export function resolveNextBrowserFrameWidth(args: {
  currentSource: SourceState;
  existingLayer: FabricObject | null;
  nextSource: { width: number; height: number };
}) {
  return hasBrowserFrameSourceSizeChange(args)
    ? args.nextSource.width
    : resolveBrowserFrameWidth(args.existingLayer, args.currentSource);
}

export function resolveBrowserFrameRelayoutOptions(
  browserFrame: BrowserFrameState
): RelayoutOptions {
  return {
    hasBrowserFrame: true,
    fitSourceToContent: browserFrame.contentMode === 'fit-content',
    preserveCanvasSize: browserFrame.canvasMode === 'keep-size',
  };
}

export function resolveBrowserFrameScene(args: {
  browserFrame: BrowserFrameState;
  currentSource: SourceState;
  options: BrowserFrameActionOptions;
  relayoutOptions: RelayoutOptions;
}) {
  return resolveEditorSceneLayout({
    browserFrame: args.browserFrame,
    canvas: args.options.canvasDocumentSize,
    fitSourceToContent: args.relayoutOptions.fitSourceToContent ?? false,
    frame: args.options.store.getFrame(),
    hasBrowserFrame: true,
    preserveCanvasSize: args.relayoutOptions.preserveCanvasSize ?? false,
    source: {
      width: args.currentSource.displayWidth,
      height: args.currentSource.displayHeight,
    },
  });
}
