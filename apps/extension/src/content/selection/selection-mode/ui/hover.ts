import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';
import type { SelectionModeDom } from './dom-types';
import type { SelectionRect } from './types';
import { getSelectionHoverFrameStyle } from './style';

export function createHoverElements(
  dom: SelectionModeDom,
  visual: ResolvedBorderPresetVisual,
  zIndexBase: number
): void {
  if (!dom.overlayContainer) {
    return;
  }

  const hoverFrame = document.createElement('div');
  hoverFrame.className = 'sniptale-selection-hover-frame';
  hoverFrame.style.cssText = getSelectionHoverFrameStyle(visual);
  dom.overlayContainer.appendChild(hoverFrame);
  dom.hoverFrame = hoverFrame;

  const hoverSizeLabel = document.createElement('div');
  hoverSizeLabel.className = 'sniptale-selection-hover-size';
  hoverSizeLabel.style.cssText = `
    position: absolute;
    background: var(--sniptale-color-surface-panel);
    color: var(--sniptale-color-text-primary);
    padding: 3px 7px;
    border: 1px solid var(--sniptale-color-border-soft);
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    white-space: nowrap;
    pointer-events: none;
    display: none;
    z-index: ${zIndexBase + 2};
    box-shadow: var(--sniptale-shadow-md);
  `;
  dom.overlayContainer.appendChild(hoverSizeLabel);
  dom.hoverSizeLabel = hoverSizeLabel;
}

export function showHoverFrame(dom: SelectionModeDom, rect: SelectionRect): void {
  if (!dom.hoverFrame || !dom.hoverSizeLabel || !dom.overlayContainer) {
    return;
  }

  dom.hoverFrame.style.left = `${rect.x}px`;
  dom.hoverFrame.style.top = `${rect.y}px`;
  dom.hoverFrame.style.width = `${rect.width}px`;
  dom.hoverFrame.style.height = `${rect.height}px`;
  dom.hoverFrame.style.display = 'block';

  dom.hoverSizeLabel.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  dom.hoverSizeLabel.style.left = `${rect.x}px`;
  dom.hoverSizeLabel.style.top = `${rect.y + rect.height + 6}px`;
  dom.hoverSizeLabel.style.display = 'block';
}

export function hideHoverFrame(dom: SelectionModeDom): void {
  if (dom.hoverFrame) {
    dom.hoverFrame.style.display = 'none';
  }
  if (dom.hoverSizeLabel) {
    dom.hoverSizeLabel.style.display = 'none';
  }
}
