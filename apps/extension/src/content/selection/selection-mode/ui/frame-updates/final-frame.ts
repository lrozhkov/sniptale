import { calculateContentSizeTooltipPosition } from '@sniptale/ui/content-size-tooltip/core';
import {
  setContentSizeTooltipPosition,
  syncContentSizeTooltipValues,
} from '@sniptale/ui/content-size-tooltip/dom';
import type { SelectionModeDom } from '../dom-types';
import type { SelectionRect } from '../types';

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
