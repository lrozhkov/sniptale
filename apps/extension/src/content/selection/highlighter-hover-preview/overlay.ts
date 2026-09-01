import {
  calculateFrameContainerCoords,
  createFrameCalcSettings,
  type ElementAbsolutePosition,
} from '../frame-runtime/coords';
import { getAbsolutePosition } from '../../platform/frame';
import { appendToContentOverlayRoot, queryAllContentUiElements } from '../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../platform/dom-host/isolated';
import {
  resolveBorderPresetVisual,
  resolveBorderShadowVisual,
} from '../../../features/highlighter/style';
import type { AppliedBorderSettings } from '../../../features/highlighter/contracts';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getCurrentBorderPreset, type HoverDomSession, type HoverSession } from './session';

const logger = createLogger({ namespace: 'ContentHighlighter:HoverPreview' });
const appliedHoverCustomCssProperties = new WeakMap<HTMLElement, string[]>();

function clearHoverCustomCssStyles(element: HTMLElement): void {
  const properties = appliedHoverCustomCssProperties.get(element) ?? [];
  for (const property of properties) {
    const cssProperty = property.startsWith('--')
      ? property
      : property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
    element.style.removeProperty(cssProperty);
  }
  appliedHoverCustomCssProperties.delete(element);
}

function applyHoverCustomCssStyles(
  element: HTMLElement,
  styles: ReturnType<typeof resolveBorderPresetVisual>['customCssStyles']
): void {
  Object.assign(element.style, styles);
  appliedHoverCustomCssProperties.set(element, Object.keys(styles));
}

function applyCanonicalHoverVisual(
  element: HTMLElement,
  visual: ReturnType<typeof resolveBorderPresetVisual>
): void {
  element.style.border = `${visual.strokeWidth}px ${visual.strokeStyle} ${visual.strokeColor}`;
  element.style.borderRadius = `${visual.radius === 0 ? 0 : visual.radius + visual.strokeWidth}px`;
  element.style.boxSizing = 'content-box';
  element.style.margin = '0';
  element.style.padding = '0';
  element.style.clipPath = 'none';
}

function applyHoverVisualDefaults(
  element: HTMLElement,
  visual: ReturnType<typeof resolveBorderPresetVisual>
): void {
  applyCanonicalHoverVisual(element, visual);
  element.style.outline = 'none';
  element.style.boxShadow =
    resolveBorderShadowVisual(visual.shadow, visual.strokeColor).hoverBoxShadow ?? 'none';
  element.style.background = visual.fillCss;
}

function applyCanonicalHoverGeometry(
  element: HTMLElement,
  geometry?: ReturnType<typeof calculateFrameContainerCoords>,
  outwardWidth = 0
): void {
  element.style.position = 'absolute';
  element.style.inset = 'auto';
  element.style.top = geometry ? `${geometry.y - outwardWidth}px` : 'auto';
  element.style.left = geometry ? `${geometry.x - outwardWidth}px` : 'auto';
  element.style.width = geometry ? `${geometry.width}px` : '0px';
  element.style.height = geometry ? `${geometry.height}px` : '0px';
}

function getHoverPreviewTransition(): string {
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return 'none';
  }
  return 'opacity 0.2s ease-out, top 0.15s ease-out, left 0.15s ease-out, width 0.15s ease-out, height 0.15s ease-out';
}

export type HoverOverlayActions = {
  createHoverOverlay: () => void;
  createOverlayContainer: () => void;
  hideHoverOverlay: () => void;
  removeHoverOverlay: () => void;
  removeOverlayContainer: () => void;
  showHoverOverlay: (element: HTMLElement) => boolean;
};

export function ensureHighlighterOverlayContainer(session: HoverDomSession): HTMLElement {
  if (session.overlayContainer) return session.overlayContainer;

  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'sniptale-highlight-container';
  applyIsolatedContentRootStyle(
    overlayContainer,
    `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: auto;
      height: auto;
      pointer-events: none;
      z-index: 2147483643;
    `
  );
  appendToContentOverlayRoot(overlayContainer);
  session.overlayContainer = overlayContainer;
  return overlayContainer;
}

export function removeHighlighterOverlayContainer(session: HoverDomSession): void {
  session.overlayContainer?.remove();
  session.overlayContainer = null;
  queryAllContentUiElements('.sniptale-highlight-container').forEach((element: Element) =>
    element.remove()
  );
  session.hoverOverlay = null;
}

export function ensureHoverOverlay(
  session: HoverDomSession,
  preset: AppliedBorderSettings
): HTMLElement {
  if (session.hoverOverlay) return session.hoverOverlay;

  const visual = resolveBorderPresetVisual(preset);
  const hoverOverlay = document.createElement('div');
  hoverOverlay.className = 'sniptale-highlight-hover';
  hoverOverlay.style.cssText = `
    position: absolute;
    box-sizing: content-box;
    margin: 0;
    padding: 0;
    pointer-events: none;
    opacity: 0.72;
    transition: ${getHoverPreviewTransition()};
    z-index: 2147483645;
  `;
  applyHoverVisualDefaults(hoverOverlay, visual);
  applyHoverCustomCssStyles(hoverOverlay, visual.customCssStyles);
  applyCanonicalHoverVisual(hoverOverlay, visual);
  applyCanonicalHoverGeometry(hoverOverlay);
  ensureHighlighterOverlayContainer(session).appendChild(hoverOverlay);
  session.hoverOverlay = hoverOverlay;
  return hoverOverlay;
}

export function removeHoverOverlay(session: HoverDomSession): void {
  session.hoverOverlay?.remove();
  session.hoverOverlay = null;
  queryAllContentUiElements('.sniptale-highlight-hover').forEach((element: Element) =>
    element.remove()
  );
}

function isCaptureUiHidden(): boolean {
  return document.body?.classList.contains('sniptale-capture-ui-hidden') ?? false;
}

export function showHoverOverlay(
  session: HoverDomSession,
  position: ElementAbsolutePosition,
  preset: AppliedBorderSettings
): boolean {
  const hoverOverlay = ensureHoverOverlay(session, preset);
  if (isCaptureUiHidden()) {
    hideHoverOverlay(session);
    return false;
  }

  const visual = resolveBorderPresetVisual(preset);
  clearHoverCustomCssStyles(hoverOverlay);
  const coords = calculateFrameContainerCoords(
    position,
    createFrameCalcSettings({ width: visual.strokeWidth, padding: visual.padding })
  );
  hoverOverlay.style.opacity = '0.72';
  hoverOverlay.style.transition = getHoverPreviewTransition();
  applyHoverVisualDefaults(hoverOverlay, visual);
  applyHoverCustomCssStyles(hoverOverlay, visual.customCssStyles);
  applyCanonicalHoverVisual(hoverOverlay, visual);
  applyCanonicalHoverGeometry(hoverOverlay, coords, visual.strokeWidth);
  hoverOverlay.style.display = 'block';
  return true;
}

export function hideHoverOverlay(session: HoverDomSession): void {
  if (session.hoverOverlay) session.hoverOverlay.style.opacity = '0';
}

function logHoverOverlayShown(
  position: ElementAbsolutePosition,
  preset: AppliedBorderSettings
): void {
  logger.debug('Showing hover overlay', {
    elementPos: {
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
    },
    presetPadding: preset.padding,
    presetBorderWidth: preset.width,
    calculatedCoords: position,
  });
}

export function createHoverOverlayActions(session: HoverSession): HoverOverlayActions {
  return {
    createOverlayContainer: () => {
      ensureHighlighterOverlayContainer(session);
    },
    removeOverlayContainer: () => {
      removeHighlighterOverlayContainer(session);
    },
    createHoverOverlay: () => {
      ensureHoverOverlay(session, getCurrentBorderPreset());
    },
    removeHoverOverlay: () => {
      removeHoverOverlay(session);
    },
    hideHoverOverlay: () => {
      hideHoverOverlay(session);
    },
    showHoverOverlay: (element) => {
      ensureHighlighterOverlayContainer(session);
      ensureHoverOverlay(session, getCurrentBorderPreset());
      if (!session.hoverOverlay || !session.overlayContainer) {
        logger.warn('Cannot show hover overlay without overlay container state');
        return false;
      }
      const position = getAbsolutePosition(element);
      const preset = getCurrentBorderPreset();
      logHoverOverlayShown(position, preset);
      return showHoverOverlay(session, position, preset);
    },
  };
}
