import type { FabricObject } from 'fabric';
import type { BrowserFrameState } from '../../../../../features/editor/document/types';
import { resolveEditorSceneLayout } from '../../../../browser-frame/layout';
import { windowHeaderGeometry } from '@sniptale/runtime-contracts/window-header';
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
    canvas: args.relayoutOptions.canvasSize ?? args.options.canvasDocumentSize,
    fitSourceToContent: args.relayoutOptions.fitSourceToContent ?? false,
    frame: args.options.store.getFrame(),
    hasBrowserFrame: true,
    preserveCanvasSize: args.relayoutOptions.preserveCanvasSize ?? false,
    source: {
      width: args.relayoutOptions.sourceSize?.width ?? args.currentSource.displayWidth,
      height: args.relayoutOptions.sourceSize?.height ?? args.currentSource.displayHeight,
    },
  });
}

/** Keep header layout independent from previously fitted source dimensions. */
export function resolveBrowserFrameComposition(args: {
  currentSource: SourceState;
  currentBrowserFrame: BrowserFrameState;
  nextBrowserFrame: BrowserFrameState;
  options: BrowserFrameActionOptions;
  hasHeader: boolean;
}) {
  const previousBase = args.hasHeader ? args.currentBrowserFrame.compositionBase : undefined;
  let base = previousBase;
  if (base) {
    const previous = resolveBrowserFrameScene({
      currentSource: args.currentSource,
      browserFrame: args.currentBrowserFrame,
      options: args.options,
      relayoutOptions: compositionRelayoutOptions(args.currentBrowserFrame, base),
    });
    // An explicit source or canvas edit establishes a new composition baseline.
    if (
      Math.abs(previous.source.width - args.currentSource.displayWidth) > 0.001 ||
      Math.abs(previous.source.height - args.currentSource.displayHeight) > 0.001 ||
      previous.canvas.width !== args.options.canvasDocumentSize.width ||
      previous.canvas.height !== args.options.canvasDocumentSize.height
    )
      base = undefined;
  }
  base ??= {
    sourceWidth: args.currentSource.displayWidth,
    sourceHeight: args.currentSource.displayHeight,
    canvasWidth: args.options.canvasDocumentSize.width,
    canvasHeight: args.options.canvasDocumentSize.height,
  };
  const browserFrame = { ...args.nextBrowserFrame, compositionBase: base };
  return {
    browserFrame,
    relayoutOptions: compositionRelayoutOptions(browserFrame, base),
    baseIsCurrent: previousBase !== undefined && base === previousBase,
  };
}

function compositionRelayoutOptions(
  browserFrame: BrowserFrameState,
  base: NonNullable<BrowserFrameState['compositionBase']>
): RelayoutOptions {
  return {
    ...resolveBrowserFrameRelayoutOptions(browserFrame),
    sourceSize: { width: base.sourceWidth, height: base.sourceHeight },
    canvasSize: { width: base.canvasWidth, height: base.canvasHeight },
  };
}
