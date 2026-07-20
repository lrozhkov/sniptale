import { createLogger } from '@sniptale/platform/observability/logger';
import { appendToContentOverlayRoot } from '../../../../../platform/dom-host';
import { getAbsolutePosition } from '../../../../../platform/frame/core';

const AI_APPLY_HIGHLIGHT_CLASS_NAME = 'sniptale-ai-apply-highlight';
const AI_APPLY_HIGHLIGHT_DURATION_MS = 2_400;
const MARKER_HIGHLIGHT_COLOR = 'rgba(245, 228, 141, 0.56)';
const INLINE_HIGHLIGHT_STYLES = [
  ['background-color', MARKER_HIGHLIGHT_COLOR],
  ['box-shadow', 'none'],
  ['outline', 'none'],
  ['transition', 'background-color 140ms ease-out'],
] as const;

type ActiveHighlightTarget = {
  overlay: HTMLElement | null;
  styles: Array<{ name: string; priority: string; value: string }>;
  target: HTMLElement;
};

let activeTargets: ActiveHighlightTarget[] = [];
let activeTimerId: number | null = null;

const logger = createLogger({ namespace: 'ContentAiDomApplyHighlight' });

export function flashAppliedAiTargets(targets: Element[]) {
  const nextTargets = collectHighlightTargets(targets);
  logger.debug('AI pick flash highlight request', {
    nextTargetsCount: nextTargets.length,
    rawTargetsCount: targets.length,
  });

  clearAppliedAiTargetHighlight();
  if (nextTargets.length === 0) {
    return;
  }

  activeTargets = nextTargets.map((target) => ({
    overlay: createHighlightOverlay(target),
    styles: applyInlineHighlightStyles(target),
    target,
  }));
  activeTargets.forEach(({ target }) => {
    target.classList.add(AI_APPLY_HIGHLIGHT_CLASS_NAME);
  });

  activeTimerId = window.setTimeout(() => {
    clearAppliedAiTargetHighlight();
  }, AI_APPLY_HIGHLIGHT_DURATION_MS);
}

export function clearAppliedAiTargetHighlight() {
  if (activeTimerId !== null) {
    window.clearTimeout(activeTimerId);
    activeTimerId = null;
  }

  activeTargets.forEach(({ overlay, styles, target }) => {
    overlay?.remove();
    target.classList.remove(AI_APPLY_HIGHLIGHT_CLASS_NAME);
    restoreInlineHighlightStyles(target, styles);
  });
  activeTargets = [];
}

function applyInlineHighlightStyles(target: HTMLElement) {
  const styles = INLINE_HIGHLIGHT_STYLES.map(([name]) => ({
    name,
    priority: target.style.getPropertyPriority(name),
    value: target.style.getPropertyValue(name),
  }));

  INLINE_HIGHLIGHT_STYLES.forEach(([name, value]) => {
    target.style.setProperty(name, value, 'important');
  });

  return styles;
}

function restoreInlineHighlightStyles(
  target: HTMLElement,
  styles: Array<{ name: string; priority: string; value: string }>
) {
  styles.forEach(({ name, priority, value }) => {
    if (value) {
      target.style.setProperty(name, value, priority);
      return;
    }

    target.style.removeProperty(name);
  });
}

function expandHighlightTarget(target: Element) {
  if (!target.isConnected) {
    return [];
  }

  if (isTableRowElement(target)) {
    const cells = [...target.cells].filter(
      (cell): cell is HTMLTableCellElement => isHtmlElement(cell) && cell.isConnected
    );
    return cells.length > 0 ? cells : [];
  }

  return isHtmlElement(target) ? [target] : [];
}

function collectHighlightTargets(targets: Element[]) {
  const expandedTargets = targets.flatMap((target) => expandHighlightTarget(target));

  return expandedTargets.filter((target, index, allTargets) => {
    return allTargets.indexOf(target) === index;
  });
}

function createHighlightOverlay(target: HTMLElement) {
  const rect = getAbsolutePosition(target);
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const overlay = document.createElement('div');
  overlay.className = 'sniptale-ai-apply-highlight-overlay';
  overlay.style.cssText = `
    position: fixed;
    left: ${rect.x}px;
    top: ${rect.y}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    pointer-events: none;
    z-index: 2147483646;
    border-radius: 3px;
    background: ${MARKER_HIGHLIGHT_COLOR};
    mix-blend-mode: multiply;
    animation: sniptale-ai-apply-highlight-pulse ${AI_APPLY_HIGHLIGHT_DURATION_MS}ms ease-out;
  `;
  appendToContentOverlayRoot(overlay);
  return overlay;
}

function isHtmlElement(target: Element): target is HTMLElement {
  const view = target.ownerDocument.defaultView;
  return Boolean(view && target instanceof view.HTMLElement);
}

function isTableRowElement(target: Element): target is HTMLTableRowElement {
  const view = target.ownerDocument.defaultView;
  return Boolean(view && target instanceof view.HTMLTableRowElement);
}
