import {
  calculateFrameContainerCoords,
  createFrameCalcSettings,
  type ElementAbsolutePosition,
} from '../frame-runtime/coords';
import { getAbsolutePosition } from '../../platform/frame';
import { appendToContentOverlayRoot, queryAllContentUiElements } from '../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../platform/dom-host/isolated';
import {
  colorToRgba,
  resolveBorderPresetVisual,
  resolveBorderShadowVisual,
} from '../../../features/highlighter/style';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  ensureHighlighterSettingsLoaded,
  getCurrentBorderPreset,
  type HoverDomSession,
  type HoverSession,
} from './session';

const logger = createLogger({ namespace: 'ContentHighlighter:HoverPreview' });

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
  showHoverOverlay: (element: HTMLElement) => void;
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

export function ensureHoverOverlay(session: HoverDomSession, preset: BorderPreset): HTMLElement {
  if (session.hoverOverlay) return session.hoverOverlay;

  const visual = resolveBorderPresetVisual(preset);
  const hoverOverlay = document.createElement('div');
  hoverOverlay.className = 'sniptale-highlight-hover';
  hoverOverlay.style.cssText = `
    position: absolute;
    border: ${visual.strokeWidth}px ${visual.strokeStyle} ${colorToRgba(
      visual.strokeColor,
      visual.strokeOpacity
    )};
    border-radius: ${visual.radius}px;
    box-sizing: content-box;
    margin: 0;
    padding: 0;
    pointer-events: none;
    opacity: 0.72;
    transition: ${getHoverPreviewTransition()};
    z-index: 2147483645;
    box-shadow: ${resolveBorderShadowVisual(visual.shadow, visual.strokeColor).hoverBoxShadow ?? 'none'};
    background-color: ${colorToRgba(visual.fillColor, visual.fillOpacity)};
  `;
  Object.assign(hoverOverlay.style, visual.customCssStyles);
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
  preset: BorderPreset
): void {
  const hoverOverlay = ensureHoverOverlay(session, preset);
  if (isCaptureUiHidden()) {
    hideHoverOverlay(session);
    return;
  }

  const visual = resolveBorderPresetVisual(preset);
  const coords = calculateFrameContainerCoords(
    position,
    createFrameCalcSettings({ width: visual.strokeWidth, padding: visual.padding })
  );
  hoverOverlay.style.top = `${coords.y}px`;
  hoverOverlay.style.left = `${coords.x}px`;
  hoverOverlay.style.width = `${coords.width}px`;
  hoverOverlay.style.height = `${coords.height}px`;
  hoverOverlay.style.borderWidth = `${visual.strokeWidth}px`;
  hoverOverlay.style.borderStyle = visual.strokeStyle;
  hoverOverlay.style.borderColor = colorToRgba(visual.strokeColor, visual.strokeOpacity);
  hoverOverlay.style.borderRadius = `${visual.radius}px`;
  hoverOverlay.style.opacity = '0.72';
  hoverOverlay.style.boxShadow =
    resolveBorderShadowVisual(visual.shadow, visual.strokeColor).hoverBoxShadow ?? 'none';
  hoverOverlay.style.backgroundColor = colorToRgba(visual.fillColor, visual.fillOpacity);
  Object.assign(hoverOverlay.style, visual.customCssStyles);
  hoverOverlay.style.display = 'block';
}

export function hideHoverOverlay(session: HoverDomSession): void {
  if (session.hoverOverlay) session.hoverOverlay.style.opacity = '0';
}

function logHoverOverlayShown(position: ElementAbsolutePosition, preset: BorderPreset): void {
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
      void ensureHighlighterSettingsLoaded(session);
      ensureHoverOverlay(session, getCurrentBorderPreset(session));
    },
    removeHoverOverlay: () => {
      removeHoverOverlay(session);
    },
    hideHoverOverlay: () => {
      hideHoverOverlay(session);
    },
    showHoverOverlay: (element) => {
      ensureHighlighterOverlayContainer(session);
      void ensureHighlighterSettingsLoaded(session);
      ensureHoverOverlay(session, getCurrentBorderPreset(session));
      if (!session.hoverOverlay || !session.overlayContainer) {
        logger.warn('Cannot show hover overlay without overlay container state');
        return;
      }
      const position = getAbsolutePosition(element);
      const preset = getCurrentBorderPreset(session);
      logHoverOverlayShown(position, preset);
      showHoverOverlay(session, position, preset);
    },
  };
}
