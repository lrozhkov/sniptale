import {
  calculateFrameContainerCoords,
  createFrameCalcSettings,
  type ElementAbsolutePosition,
} from '../frame-runtime/coords';
import { appendToContentOverlayRoot, queryAllContentUiElements } from '../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../platform/dom-host/isolated';
import {
  colorToRgba,
  percentToUnit,
  resolveBorderPresetVisual,
  resolveBorderShadowVisual,
} from '../../../features/highlighter/style';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import type { HighlighterHoverState } from './types';

export function ensureHighlighterOverlayContainer(state: HighlighterHoverState): HTMLElement {
  if (state.overlayContainer) return state.overlayContainer;

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
  state.overlayContainer = overlayContainer;
  return overlayContainer;
}

export function removeHighlighterOverlayContainer(state: HighlighterHoverState): void {
  state.overlayContainer?.remove();
  state.overlayContainer = null;
  queryAllContentUiElements('.sniptale-highlight-container').forEach((element: Element) =>
    element.remove()
  );
  state.hoverOverlay = null;
}

export function ensureHoverOverlay(
  state: HighlighterHoverState,
  preset: BorderPreset
): HTMLElement {
  if (state.hoverOverlay) return state.hoverOverlay;

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
    opacity: ${Math.min(0.6, percentToUnit(visual.strokeOpacity))};
    transition:
      opacity 0.2s ease-out,
      top 0.15s ease-out,
      left 0.15s ease-out,
      width 0.15s ease-out,
      height 0.15s ease-out;
    z-index: 2147483645;
    box-shadow: ${resolveBorderShadowVisual(visual.shadow, visual.strokeColor).hoverBoxShadow ?? 'none'};
    background-color: ${colorToRgba(visual.fillColor, visual.fillOpacity)};
  `;
  Object.assign(hoverOverlay.style, visual.customCssStyles);
  ensureHighlighterOverlayContainer(state).appendChild(hoverOverlay);
  state.hoverOverlay = hoverOverlay;
  return hoverOverlay;
}

export function removeHoverOverlay(state: HighlighterHoverState): void {
  state.hoverOverlay?.remove();
  state.hoverOverlay = null;
  queryAllContentUiElements('.sniptale-highlight-hover').forEach((element: Element) =>
    element.remove()
  );
}

function isCaptureUiHidden(): boolean {
  return document.body?.classList.contains('sniptale-capture-ui-hidden') ?? false;
}

export function showHoverOverlay(
  state: HighlighterHoverState,
  position: ElementAbsolutePosition,
  preset: BorderPreset
): void {
  const hoverOverlay = ensureHoverOverlay(state, preset);
  if (isCaptureUiHidden()) {
    hideHoverOverlay(state);
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
  hoverOverlay.style.opacity = String(Math.min(0.6, percentToUnit(visual.strokeOpacity)));
  hoverOverlay.style.boxShadow =
    resolveBorderShadowVisual(visual.shadow, visual.strokeColor).hoverBoxShadow ?? 'none';
  hoverOverlay.style.backgroundColor = colorToRgba(visual.fillColor, visual.fillOpacity);
  Object.assign(hoverOverlay.style, visual.customCssStyles);
  hoverOverlay.style.display = 'block';
}

export function hideHoverOverlay(state: HighlighterHoverState): void {
  if (state.hoverOverlay) {
    state.hoverOverlay.style.opacity = '0';
  }
}
