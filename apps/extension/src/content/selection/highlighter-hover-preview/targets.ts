import {
  getContentUiElementById,
  queryAllContentUiElements,
  queryContentUiElement,
} from '../../platform/dom-host';
import { isContentRuntimeUiElement } from '../../platform/page-context/dom';
import {
  readHoverFrameCache,
  type HoverFrameCacheEntry,
  type HoverFrameCacheSession,
} from './session';
import { isPointWithinFrameBorderHit } from '../frame-runtime/ui-controller/hit-test';

const HIGHLIGHTER_EXTENSION_UI_CLASSES = [
  'sniptale-highlight',
  'sniptale-highlight-hover',
  'sniptale-highlight-container',
  'sniptale-frames-container',
  'sniptale-interactive-frame',
  'sniptale-action-toolbar',
  'sniptale-toolbar-portal-wrapper',
  'sniptale-frame-toolbar-trigger',
  'sniptale-frame-toolbar-bridge',
  'sniptale-frame-quick-action',
  'sniptale-effect-toggle',
  'sniptale-resize-handle',
  'sniptale-focus-overlay',
  'sniptale-frame-settings-popover',
  'sniptale-step-badge-popover',
  'sniptale-callout-settings-popover',
  'sniptale-step-badge',
  'sniptale-callout',
  'sniptale-callout-format-toolbar',
  'sniptale-callout-drag-handle',
  'sniptale-callout-tail-handle',
  'sniptale-callout-settings-handle',
  'sniptale-step-badge-controls',
] as const;

const HIGHLIGHTER_EXTENSION_UI_SELECTOR = [
  '.sniptale-action-toolbar',
  '.sniptale-toolbar-portal-wrapper',
  '.sniptale-frame-toolbar-trigger',
  '.sniptale-frame-toolbar-bridge',
  '.sniptale-frame-quick-action',
  '.sniptale-effect-toggle',
  '.sniptale-resize-handle',
  '.sniptale-frame-settings-popover',
  '.sniptale-step-badge-popover',
  '.sniptale-callout-settings-popover',
  '.sniptale-step-badge',
  '.sniptale-callout',
  '.sniptale-callout-format-toolbar',
  '.sniptale-callout-drag-handle',
  '.sniptale-callout-tail-handle',
  '.sniptale-callout-settings-handle',
  '.sniptale-step-badge-controls',
].join(', ');

function collectFrameCacheEntries(): Array<readonly [string, HoverFrameCacheEntry]> {
  return queryAllContentUiElements('.sniptale-interactive-frame').flatMap((frame) => {
    const element = frame as HTMLElement;
    const frameId = element.dataset['frameId'];
    return frameId ? ([[frameId, { element }]] as const) : [];
  });
}

export function isNearExistingFrameBorder(
  session: HoverFrameCacheSession,
  x: number,
  y: number
): boolean {
  const frameCache = readHoverFrameCache(session, collectFrameCacheEntries);
  for (const { element } of frameCache.values()) {
    const rect = element.getBoundingClientRect();
    if (
      isPointWithinFrameBorderHit(
        { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        x,
        y
      )
    ) {
      return true;
    }
  }
  return false;
}

export function isInsideExistingFrame(
  session: HoverFrameCacheSession,
  x: number,
  y: number
): boolean {
  const frameCache = readHoverFrameCache(session, collectFrameCacheEntries);
  for (const { element } of frameCache.values()) {
    const rect = element.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return true;
    }
  }
  return false;
}

export function isHighlighterExtensionUiElement(target: HTMLElement): boolean {
  const popoverPortal =
    getContentUiElementById('sniptale-toolbar-portal') ??
    queryContentUiElement('.sniptale-toolbar-portal-wrapper');
  return isContentRuntimeUiElement(target, {
    classNames: HIGHLIGHTER_EXTENSION_UI_CLASSES,
    closestSelectors: ['.sniptale-action-toolbar', HIGHLIGHTER_EXTENSION_UI_SELECTOR],
    portalElements: [popoverPortal],
  });
}

export function hasBlockingHighlighterPopover(): boolean {
  return Boolean(
    queryContentUiElement('.sniptale-frame-settings-popover') ||
    queryContentUiElement('.sniptale-step-badge-popover') ||
    queryContentUiElement('.sniptale-callout-settings-popover')
  );
}
