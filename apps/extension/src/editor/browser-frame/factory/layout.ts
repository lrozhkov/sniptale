import type { BrowserFrameState } from '../../../features/editor/document/types';
import { BROWSER_HEADER_HEIGHT, MIN_CANVAS_SIZE } from '../../document/model';
import type { BrowserFrameMockupLayout, BrowserFrameSourceRect } from './types';

const BROWSER_WINDOW_RADIUS = 12;

function roundRect(rect: BrowserFrameSourceRect): BrowserFrameSourceRect {
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.max(MIN_CANVAS_SIZE, Math.round(rect.width)),
    height: Math.max(MIN_CANVAS_SIZE, Math.round(rect.height)),
  };
}

function resolveBrowserFrameRadius(source: BrowserFrameSourceRect): number {
  return Math.max(4, Math.min(BROWSER_WINDOW_RADIUS, Math.round(source.width / 24)));
}

export function resolveBrowserFrameMockupLayout(args: {
  browserFrame: BrowserFrameState;
  source: BrowserFrameSourceRect;
}): BrowserFrameMockupLayout {
  const source = roundRect(args.source);
  const headerHeight = BROWSER_HEADER_HEIGHT;

  return {
    chrome: {
      left: source.left,
      top: source.top - headerHeight,
      width: source.width,
      height: headerHeight,
    },
    content: source,
    headerHeight,
    radius: resolveBrowserFrameRadius(source),
  };
}
