import type { Canvas } from 'fabric';
import type { BrowserFrameState } from '../../../features/editor/document/types';
import { findBrowserFrameHeader } from '../tools/decorations';

import type { SourceState } from '../../document/model/source-state';

type CanvasSize = {
  width: number;
  height: number;
};

type BrowserFrameLogger = (stage: string, payload?: Record<string, unknown>) => void;

export function logBrowserFrameApplyStart(options: {
  logBrowserFrame: BrowserFrameLogger;
  currentBrowserFrame: BrowserFrameState;
  nextBrowserFrame: BrowserFrameState;
  canvasDocumentSize: CanvasSize;
  source: SourceState;
}): void {
  const { logBrowserFrame, currentBrowserFrame, nextBrowserFrame, canvasDocumentSize, source } =
    options;

  logBrowserFrame('apply:start', {
    hadUrl: currentBrowserFrame.url.length > 0,
    hasUrl: nextBrowserFrame.url.length > 0,
    canvasWidth: canvasDocumentSize.width,
    canvasHeight: canvasDocumentSize.height,
    sourceWidth: source.displayWidth,
    sourceHeight: source.displayHeight,
    url: nextBrowserFrame.url,
    canvasMode: nextBrowserFrame.canvasMode,
    contentMode: nextBrowserFrame.contentMode,
  });
}

export function logBrowserFrameApplyDone(options: {
  logBrowserFrame: BrowserFrameLogger;
  canvas: Canvas;
  canvasDocumentSize: CanvasSize;
  source: SourceState;
}): void {
  const { logBrowserFrame, canvas, canvasDocumentSize, source } = options;
  const header = findBrowserFrameHeader(canvas);

  logBrowserFrame('apply:done', {
    headerVisible: header?.visible !== false,
    headerWidth: header?.getScaledWidth(),
    headerHeight: header?.getScaledHeight(),
    headerLeft: header?.left,
    headerTop: header?.top,
    canvasWidth: canvasDocumentSize.width,
    canvasHeight: canvasDocumentSize.height,
    sourceLeft: source.left,
    sourceTop: source.top,
    sourceWidth: source.displayWidth,
    sourceHeight: source.displayHeight,
  });
}

export function logBrowserFrameRemoveStart(options: {
  logBrowserFrame: BrowserFrameLogger;
  canvas: Canvas;
  canvasDocumentSize: CanvasSize;
  source: SourceState;
}): void {
  const { logBrowserFrame, canvas, canvasDocumentSize, source } = options;

  logBrowserFrame('remove:start', {
    hasHeader: Boolean(findBrowserFrameHeader(canvas)),
    canvasWidth: canvasDocumentSize.width,
    canvasHeight: canvasDocumentSize.height,
    sourceWidth: source.displayWidth,
    sourceHeight: source.displayHeight,
  });
}

export function logBrowserFrameRemoveDone(options: {
  logBrowserFrame: BrowserFrameLogger;
  canvasDocumentSize: CanvasSize;
  source: SourceState;
}): void {
  const { logBrowserFrame, canvasDocumentSize, source } = options;

  logBrowserFrame('remove:done', {
    canvasWidth: canvasDocumentSize.width,
    canvasHeight: canvasDocumentSize.height,
    sourceLeft: source.left,
    sourceTop: source.top,
    sourceWidth: source.displayWidth,
    sourceHeight: source.displayHeight,
  });
}
