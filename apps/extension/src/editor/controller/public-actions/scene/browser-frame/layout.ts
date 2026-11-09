import type { FabricObject } from 'fabric';
import type { BrowserFrameState } from '../../../../../features/editor/document/types';
import {
  resolveSceneComposition,
  resolveSceneCompositionBase,
} from '../../../document/scene/composition';
import { windowHeaderGeometry } from '@sniptale/runtime-contracts/window-header';
import { resolveEditorWindowHeader } from '../../../../../features/editor/document/constants';

import type { SourceState } from '../../../../document/model/source-state';
import type { RelayoutOptions } from '../helpers';
import type { BrowserFrameActionOptions } from './types';

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

export function resolveBrowserFrameScene(args: {
  browserFrame: BrowserFrameState;
  currentSource: SourceState;
  options: BrowserFrameActionOptions;
  relayoutOptions: RelayoutOptions;
}) {
  const frame = args.options.store.getFrame();
  const base =
    args.relayoutOptions.compositionBase ??
    resolveSceneCompositionBase({
      source: args.currentSource,
      canvasSize: args.options.canvasDocumentSize,
      frame,
      browserFrame: args.browserFrame,
      hasBrowserFrame: false,
    });
  return resolveSceneComposition({
    base,
    frame,
    browserFrame: args.browserFrame,
    hasBrowserFrame: args.relayoutOptions.hasBrowserFrame ?? true,
    options: args.relayoutOptions,
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
  const compositionBase = resolveSceneCompositionBase({
    source: args.currentSource,
    canvasSize: args.options.canvasDocumentSize,
    frame: args.options.store.getFrame(),
    browserFrame: args.currentBrowserFrame,
    hasBrowserFrame: args.hasHeader,
  });
  return {
    browserFrame: args.nextBrowserFrame,
    relayoutOptions: { hasBrowserFrame: true, compositionBase },
  };
}
