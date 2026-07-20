import {
  logBrowserFrameApplyDone,
  logBrowserFrameApplyStart,
  logBrowserFrameRemoveDone,
  logBrowserFrameRemoveStart,
} from './logging';
import { createEditorBrowserFrameContext } from './params';
import { runBrowserFrameTransition } from './transition';
import type { ApplyBrowserFrameOptions, BrowserFrameTransitionOwnerContext } from './types';

export async function applyEditorBrowserFrame(options: ApplyBrowserFrameOptions): Promise<boolean> {
  const context = createEditorBrowserFrameContext(options);
  if (!context) {
    return false;
  }

  const next = { ...context.currentBrowserFrame, ...options.browserFrame };
  logBrowserFrameApplyStart({
    logBrowserFrame: context.logBrowserFrame,
    currentBrowserFrame: context.currentBrowserFrame,
    nextBrowserFrame: next,
    canvasDocumentSize: context.canvasDocumentSize,
    source: context.source,
  });
  const applied = await runBrowserFrameTransition(context, next, true);
  if (!applied) {
    return false;
  }
  logBrowserFrameApplyDone({
    logBrowserFrame: context.logBrowserFrame,
    canvas: context.canvas,
    canvasDocumentSize: context.canvasDocumentSize,
    source: context.source,
  });
  return true;
}

export async function removeEditorBrowserFrame(
  options: BrowserFrameTransitionOwnerContext
): Promise<boolean> {
  const context = createEditorBrowserFrameContext(options);
  if (!context) {
    return false;
  }

  const next = { ...context.currentBrowserFrame };
  logBrowserFrameRemoveStart({
    logBrowserFrame: context.logBrowserFrame,
    canvas: context.canvas,
    canvasDocumentSize: context.canvasDocumentSize,
    source: context.source,
  });
  const applied = await runBrowserFrameTransition(context, next, false);
  if (!applied) {
    return false;
  }
  logBrowserFrameRemoveDone({
    logBrowserFrame: context.logBrowserFrame,
    canvasDocumentSize: context.canvasDocumentSize,
    source: context.source,
  });
  return true;
}
