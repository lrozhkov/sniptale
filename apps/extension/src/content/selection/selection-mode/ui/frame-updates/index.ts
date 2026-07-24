import { calculateContentSizeTooltipPosition } from '@sniptale/ui/content-size-tooltip/core';
import {
  setContentSizeTooltipPosition,
  syncContentSizeTooltipValues,
} from '@sniptale/ui/content-size-tooltip/dom';
import { showSelectionModeCancelButton } from '../cancel-button';
import type { SelectionModeDom } from '../dom-types';
import type { SelectionRect } from '../types';

function createDragFrameSizeLabel(): HTMLDivElement {
  const label = document.createElement('div');
  label.className = 'sniptale-drag-size-label';
  label.style.cssText = `
    position: absolute;
    background: var(--sniptale-color-surface-panel);
    color: var(--sniptale-color-text-primary);
    padding: 3px 7px;
    border: 1px solid var(--sniptale-color-border-soft);
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    bottom: -24px;
    left: 50%;
    transform: translateX(-50%);
    box-shadow: var(--sniptale-shadow-md);
  `;

  return label;
}

function updateOverlayShades(finalOverlay: HTMLElement, rect: SelectionRect): void {
  const topShade = finalOverlay.querySelector('.sniptale-shade-top') as HTMLElement | null;
  const bottomShade = finalOverlay.querySelector('.sniptale-shade-bottom') as HTMLElement | null;
  const leftShade = finalOverlay.querySelector('.sniptale-shade-left') as HTMLElement | null;
  const rightShade = finalOverlay.querySelector('.sniptale-shade-right') as HTMLElement | null;

  if (topShade) {
    topShade.style.height = `${rect.y}px`;
  }

  if (bottomShade) {
    bottomShade.style.top = `${rect.y + rect.height}px`;
    bottomShade.style.height = `${window.innerHeight - rect.y - rect.height}px`;
  }

  if (leftShade) {
    leftShade.style.top = `${rect.y}px`;
    leftShade.style.height = `${rect.height}px`;
    leftShade.style.width = `${rect.x}px`;
  }

  if (rightShade) {
    rightShade.style.top = `${rect.y}px`;
    rightShade.style.height = `${rect.height}px`;
    rightShade.style.left = `${rect.x + rect.width}px`;
    rightShade.style.width = `${window.innerWidth - rect.x - rect.width}px`;
  }
}

function updateSizePanelPosition(sizePanel: HTMLElement, rect: SelectionRect): void {
  setContentSizeTooltipPosition(
    sizePanel,
    calculateContentSizeTooltipPosition({ anchorRect: rect })
  );
}

export function updateDragFrame(dom: SelectionModeDom, rect: SelectionRect): void {
  if (!dom.dragFrame) return;

  dom.dragFrame.style.left = `${rect.x}px`;
  dom.dragFrame.style.top = `${rect.y}px`;
  dom.dragFrame.style.width = `${rect.width}px`;
  dom.dragFrame.style.height = `${rect.height}px`;

  const sizeText = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  let label = dom.dragFrame.querySelector('.sniptale-drag-size-label') as HTMLElement | null;
  if (!label) {
    label = createDragFrameSizeLabel();
    dom.dragFrame.appendChild(label);
  }

  label.textContent = sizeText;
}

export function updateFinalFrame(dom: SelectionModeDom, rect: SelectionRect): void {
  if (
    !dom.finalFrame ||
    !dom.widthInput ||
    !dom.heightInput ||
    !dom.finalOverlay ||
    !dom.sizePanel ||
    !dom.sizeTooltip
  ) {
    return;
  }

  dom.finalFrame.style.left = `${rect.x}px`;
  dom.finalFrame.style.top = `${rect.y}px`;
  dom.finalFrame.style.width = `${rect.width}px`;
  dom.finalFrame.style.height = `${rect.height}px`;
  syncContentSizeTooltipValues({
    tooltip: dom.sizeTooltip,
    width: rect.width,
    height: rect.height,
    maintainAspectRatio: dom.aspectRatioButton?.getAttribute('aria-pressed') === 'true',
    widthMin: Number(dom.widthInput.min),
    widthMax: Number(dom.widthInput.max),
    heightMin: Number(dom.heightInput.min),
    heightMax: Number(dom.heightInput.max),
  });

  updateOverlayShades(dom.finalOverlay, rect);
  updateSizePanelPosition(dom.sizePanel, rect);
}

export function resetFinalElements(dom: SelectionModeDom): void {
  dom.finalFrame?.remove();
  dom.finalOverlay?.remove();
  dom.sizePanel?.remove();

  dom.finalFrame = null;
  dom.finalOverlay = null;
  dom.scissorsIcon = null;
  dom.sizePanel = null;
  dom.sizeTooltip = null;
  dom.widthInput = null;
  dom.heightInput = null;
  dom.aspectRatioButton = null;
  showSelectionModeCancelButton(dom);
}

export function cleanupSelectionModeDom(dom: SelectionModeDom): void {
  dom.overlayContainer?.remove();

  dom.overlayContainer = null;
  dom.hoverFrame = null;
  dom.scissorsIcon = null;
  dom.hoverSizeLabel = null;
  dom.dragFrame = null;
  dom.finalFrame = null;
  dom.finalOverlay = null;
  dom.sizePanel = null;
  dom.sizeTooltip = null;
  dom.widthInput = null;
  dom.heightInput = null;
  dom.aspectRatioButton = null;
  dom.cancelButton = null;
  dom.dragEventCatcher = null;
}
