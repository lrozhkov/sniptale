import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../features/editor/document/types';

export function shouldPreserveCanvasForBrowserTransition(
  frame: EditorFrameSettings,
  current: BrowserFrameState,
  next: BrowserFrameState
): boolean {
  return (
    frame.layoutMode === 'fit-image' ||
    current.canvasMode === 'keep-size' ||
    next.canvasMode === 'keep-size'
  );
}

export function shouldFitSourceForBrowserTransition(
  frame: EditorFrameSettings,
  current: BrowserFrameState,
  next: BrowserFrameState
): boolean {
  return (
    frame.layoutMode === 'fit-image' ||
    current.contentMode === 'fit-content' ||
    next.contentMode === 'fit-content'
  );
}
