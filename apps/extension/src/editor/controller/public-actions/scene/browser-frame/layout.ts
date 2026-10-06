import type { FabricObject } from 'fabric';
import type { BrowserFrameState } from '../../../../../features/editor/document/types';
import { resolveEditorSceneLayout } from '../../../../browser-frame/layout';
import { windowHeaderGeometry } from '../../../../../features/browser-frame/header';
import { resolveEditorWindowHeader } from '../../../../../features/editor/document/constants';

import type { SourceState } from '../../../../document/model/source-state';
import type { RelayoutOptions } from '../helpers';
import type { BrowserFrameActionOptions } from './types';

function resolveBrowserFrameWidth(existingLayer: FabricObject | null, source: SourceState): number {
  return existingLayer ? existingLayer.getScaledWidth() : source.displayWidth;
}

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
  browserFrame?: BrowserFrameState;
  nextSource: { left: number; top: number; width?: number; height?: number };
}) {
  const height = windowHeaderGeometry(resolveEditorWindowHeader(args.browserFrame), {
    width: args.nextSource.width ?? args.currentSource.displayWidth,
    height: args.nextSource.height ?? args.currentSource.displayHeight,
  }).height;
  return { left: args.nextSource.left, top: args.nextSource.top - height };
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
