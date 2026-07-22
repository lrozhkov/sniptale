import { AREA_SELECTION_TOOLTIP_ID } from '@sniptale/ui/branding';
import { translate } from '../../../platform/i18n';
import { appendToContentOverlayRoot, getContentUiElementById } from '../../platform/dom-host';

export interface AreaSelectionSurface {
  createSelectionElement(): HTMLDivElement;
  hideSelectionElement(selectionElement: HTMLDivElement | null): void;
  removeSelectionElement(selectionElement: HTMLDivElement): void;
  removeSelectionTooltip(): void;
  showSelectionElement(
    selectionElement: HTMLDivElement,
    origin: { startX: number; startY: number }
  ): void;
  showSelectionTooltip(): void;
  updateSelectionBox(
    selectionElement: HTMLDivElement,
    origin: { startX: number; startY: number },
    currentPoint: { x: number; y: number }
  ): void;
}

function createSelectionElement(): HTMLDivElement {
  const selection = document.createElement('div');
  selection.style.cssText = `
    position: fixed;
    border: 2px dashed var(--sniptale-color-danger);
    background-color: color-mix(in srgb, var(--sniptale-color-danger-soft) 52%, transparent);
    pointer-events: none;
    z-index: 2147483647;
    display: none;
    box-shadow:
      0 0 8px color-mix(in srgb, var(--sniptale-color-danger) 22%, transparent),
      0 0 16px color-mix(in srgb, var(--sniptale-color-danger) 12%, transparent);
  `;
  appendToContentOverlayRoot(selection);
  return selection;
}

function removeSelectionTooltip(): void {
  getContentUiElementById(AREA_SELECTION_TOOLTIP_ID)?.remove();
}

function showSelectionTooltip(): void {
  removeSelectionTooltip();
  const tooltip = document.createElement('div');
  tooltip.id = AREA_SELECTION_TOOLTIP_ID;
  tooltip.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: color-mix(in srgb, var(--sniptale-color-surface-panel) 88%, var(--sniptale-color-overlay) 12%);
    color: var(--sniptale-color-text-primary);
    padding: 12px 24px;
    border-radius: 8px;
    border: 1px solid var(--sniptale-color-border-soft);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    box-shadow: var(--sniptale-shadow-sm);
  `;
  tooltip.textContent = translate('content.runtime.areaSelectPrompt');
  appendToContentOverlayRoot(tooltip);
}

function updateSelectionBox(
  selectionElement: HTMLDivElement,
  origin: { startX: number; startY: number },
  currentPoint: { x: number; y: number }
): void {
  const width = Math.abs(currentPoint.x - origin.startX);
  const height = Math.abs(currentPoint.y - origin.startY);
  const left = currentPoint.x < origin.startX ? currentPoint.x : origin.startX;
  const top = currentPoint.y < origin.startY ? currentPoint.y : origin.startY;

  selectionElement.style.width = `${width}px`;
  selectionElement.style.height = `${height}px`;
  selectionElement.style.left = `${left}px`;
  selectionElement.style.top = `${top}px`;
}

function hideSelectionElement(selectionElement: HTMLDivElement | null): void {
  if (selectionElement) {
    selectionElement.style.display = 'none';
  }
}

function showSelectionElement(
  selectionElement: HTMLDivElement,
  origin: { startX: number; startY: number }
): void {
  selectionElement.style.left = `${origin.startX}px`;
  selectionElement.style.top = `${origin.startY}px`;
  selectionElement.style.width = '0px';
  selectionElement.style.height = '0px';
  selectionElement.style.display = 'block';
}

function removeSelectionElement(selectionElement: HTMLDivElement): void {
  selectionElement.remove();
}

export const areaSelectionSurface: AreaSelectionSurface = {
  createSelectionElement,
  hideSelectionElement,
  removeSelectionElement,
  removeSelectionTooltip,
  showSelectionElement,
  showSelectionTooltip,
  updateSelectionBox,
};
