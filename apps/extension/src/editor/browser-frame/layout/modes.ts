import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import { windowHeaderGeometry } from '../../../features/browser-frame/header';
import { resolveEditorWindowHeader } from '../../../features/editor/document/constants';

type BrowserFrameActiveStateInput = boolean | Pick<BrowserFrameState, 'enabled'>;

function resolveBrowserFrameActiveState(
  browserFrameOrActive: BrowserFrameActiveStateInput,
  hasBrowserFrame?: boolean
): boolean {
  if (typeof browserFrameOrActive === 'boolean') {
    return browserFrameOrActive;
  }

  return hasBrowserFrame ?? Boolean(browserFrameOrActive.enabled);
}

export function getBrowserHeaderHeight(
  browserFrameOrActive: BrowserFrameActiveStateInput,
  browserFrame?: BrowserFrameState,
  source: { width: number; height: number } = { width: 900, height: 900 }
): number {
  const hasBrowserFrame = resolveBrowserFrameActiveState(browserFrameOrActive);
  return hasBrowserFrame
    ? windowHeaderGeometry(resolveEditorWindowHeader(browserFrame), source).height
    : 0;
}

export function shouldPreserveCanvasForBrowserFrame(
  frame: EditorFrameSettings,
  browserFrame: Pick<BrowserFrameState, 'canvasMode' | 'enabled'>,
  hasBrowserFrame?: boolean
): boolean {
  return (
    frame.layoutMode === 'fit-image' ||
    (resolveBrowserFrameActiveState(browserFrame, hasBrowserFrame) &&
      browserFrame.canvasMode === 'keep-size')
  );
}

export function shouldFitSourceToContent(
  frame: EditorFrameSettings,
  browserFrame: Pick<BrowserFrameState, 'contentMode' | 'enabled'>,
  hasBrowserFrame?: boolean
): boolean {
  return (
    frame.layoutMode === 'fit-image' ||
    (resolveBrowserFrameActiveState(browserFrame, hasBrowserFrame) &&
      browserFrame.contentMode === 'fit-content')
  );
}
