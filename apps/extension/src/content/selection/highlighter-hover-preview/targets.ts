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

const HIGHLIGHTER_EXTENSION_UI_CLASSES = [
  'sniptale-highlight',
  'sniptale-highlight-hover',
  'sniptale-highlight-container',
  'sniptale-frames-container',
  'sniptale-interactive-frame',
  'sniptale-action-toolbar',
  'sniptale-effect-toggle',
  'sniptale-resize-handle',
  'sniptale-focus-overlay',
  'sniptale-frame-settings-popover',
  'sniptale-step-badge-popover',
  'sniptale-callout-settings-popover',
  'sniptale-step-badge',
  'sniptale-callout',
  'sniptale-callout-format-toolbar',
] as const;

const HIGHLIGHTER_EXTENSION_UI_SELECTOR = [
  '.sniptale-action-toolbar',
  '.sniptale-effect-toggle',
  '.sniptale-resize-handle',
  '.sniptale-frame-settings-popover',
  '.sniptale-step-badge-popover',
  '.sniptale-callout-settings-popover',
  '.sniptale-step-badge',
  '.sniptale-callout',
  '.sniptale-callout-format-toolbar',
].join(', ');

function collectFrameCacheEntries(): Array<readonly [string, HoverFrameCacheEntry]> {
  return queryAllContentUiElements('.sniptale-interactive-frame').map((frame) => {
    const element = frame as HTMLElement;
    return [
      element.id || element.className,
      { element, rect: element.getBoundingClientRect() },
    ] as const;
  });
}

export function isNearExistingFrameBorder(
  session: HoverFrameCacheSession,
  x: number,
  y: number
): boolean {
  const exclusionRadius = 30;
  const frameCache = readHoverFrameCache(session, collectFrameCacheEntries);
  for (const { rect } of frameCache.values()) {
    const expandedLeft = rect.left - exclusionRadius;
    const expandedRight = rect.right + exclusionRadius;
    const expandedTop = rect.top - exclusionRadius;
    const expandedBottom = rect.bottom + exclusionRadius;
    if (x >= expandedLeft && x <= expandedRight && y >= expandedTop && y <= expandedBottom) {
      return !(x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    }
  }
  return false;
}

function hasHighlighterUiClass(target: HTMLElement): boolean {
  return HIGHLIGHTER_EXTENSION_UI_CLASSES.some((className) => target.classList.contains(className));
}

export function isHighlighterExtensionUiElement(target: HTMLElement): boolean {
  if (hasHighlighterUiClass(target)) return true;
  const popoverPortal =
    getContentUiElementById('sniptale-toolbar-portal') ??
    queryContentUiElement('.sniptale-toolbar-portal-wrapper');
  return isContentRuntimeUiElement(target, {
    closestSelectors: ['.sniptale-action-toolbar', HIGHLIGHTER_EXTENSION_UI_SELECTOR],
    portalElements: [popoverPortal],
  });
}

export function hasBlockingHighlighterPopover(): boolean {
  return Boolean(
    queryContentUiElement('.sniptale-step-badge-popover') ||
    queryContentUiElement('.sniptale-callout-settings-popover')
  );
}
