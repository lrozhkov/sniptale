import { AREA_SELECTION_TOOLTIP_ID } from '@sniptale/ui/branding';
import { runBestEffort } from '@sniptale/foundation/best-effort';
import { appendToContentOverlayRoot, getContentUiElementById } from '../../platform/dom-host';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../application/runtime-services/services';
import type { SelectedArea } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../platform/i18n';

const logger = createLogger({ namespace: 'ContentAreaSelector' });

export function createSelectionElement(): HTMLDivElement {
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

export function showAreaSelectionTooltip() {
  removeAreaSelectionTooltip();
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

export function removeAreaSelectionTooltip() {
  const tooltip = getContentUiElementById(AREA_SELECTION_TOOLTIP_ID);
  if (tooltip) {
    tooltip.remove();
  }
}

export function updateSelectionBox(
  selectionElement: HTMLDivElement,
  origin: { startX: number; startY: number },
  currentPoint: { x: number; y: number }
) {
  const width = Math.abs(currentPoint.x - origin.startX);
  const height = Math.abs(currentPoint.y - origin.startY);
  const left = currentPoint.x < origin.startX ? currentPoint.x : origin.startX;
  const top = currentPoint.y < origin.startY ? currentPoint.y : origin.startY;

  selectionElement.style.width = `${width}px`;
  selectionElement.style.height = `${height}px`;
  selectionElement.style.left = `${left}px`;
  selectionElement.style.top = `${top}px`;
}

function buildSelectedArea(props: {
  endX: number;
  endY: number;
  startX: number;
  startY: number;
}): SelectedArea | null {
  const width = Math.abs(props.endX - props.startX);
  const height = Math.abs(props.endY - props.startY);

  if (width < 10 || height < 10) {
    return null;
  }

  const left = props.endX < props.startX ? props.endX : props.startX;
  const top = props.endY < props.startY ? props.endY : props.startY;
  const zoom = window.devicePixelRatio || 1;

  return {
    x: Math.round(left * zoom),
    y: Math.round(top * zoom),
    width: Math.round(width * zoom),
    height: Math.round(height * zoom),
  };
}

function notifyAreaSelected(selectedArea: SelectedArea) {
  runBestEffort(
    getContentRuntimeServices().messaging.sendRuntimeMessage({
      type: 'AREA_SELECTED',
      area: selectedArea,
    }),
    logger,
    'Failed to notify background about selected area'
  );
}

export function hideSelectionElement(selectionElement: HTMLDivElement | null) {
  if (selectionElement) {
    selectionElement.style.display = 'none';
  }
}

export function completeAreaSelection(props: {
  callback: ((area: SelectedArea) => void) | null;
  cleanup: () => void;
  endX: number;
  endY: number;
  reject: (reason?: unknown) => void;
  startX: number;
  startY: number;
}) {
  const selectedArea = buildSelectedArea({
    endX: props.endX,
    endY: props.endY,
    startX: props.startX,
    startY: props.startY,
  });

  if (!selectedArea) {
    logger.warn('Selection too small, ignoring');
    props.reject(new Error(translate('content.runtime.areaSelectTooSmall')));
    props.cleanup();
    return;
  }

  logger.log('Area selected', selectedArea);
  notifyAreaSelected(selectedArea);
  props.callback?.(selectedArea);
  props.cleanup();
}

export function handleAreaSelectionTimeout(props: {
  cleanup: () => void;
  isSelecting: boolean;
  reject: (reason?: unknown) => void;
  selectionElement: HTMLDivElement | null;
}) {
  if (!props.isSelecting) {
    return;
  }

  hideSelectionElement(props.selectionElement);
  removeAreaSelectionTooltip();
  props.reject(new Error(translate('content.runtime.areaSelectTimeout')));
  props.cleanup();
}
