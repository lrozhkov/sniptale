import type { ResizeDirection } from '../dom-types';
import type { FinalElementsOptions } from './types';
import { getSelectionFinalFrameStyle } from '../style';

export function createSelectionModeFinalFrame(options: FinalElementsOptions): HTMLElement {
  const finalFrame = document.createElement('div');
  finalFrame.className = 'sniptale-selection-final-frame';
  finalFrame.style.cssText = getSelectionFinalFrameStyle(options.visual, options.zIndexBase);
  return finalFrame;
}

export function createSelectionModeFinalResizeHandles(
  finalFrame: HTMLElement,
  borderColor: string
): void {
  const directions: ResizeDirection[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  directions.forEach((direction) => {
    const handle = document.createElement('div');
    handle.className = `sniptale-resize-handle sniptale-resize-${direction}`;
    handle.dataset['direction'] = direction;
    handle.style.cssText = getResizeHandleStyle(direction, borderColor);
    finalFrame.appendChild(handle);
  });
}

function getResizeHandleStyle(direction: ResizeDirection, borderColor: string): string {
  const baseStyle = `
    position: absolute;
    width: 10px;
    height: 10px;
    background: var(--sniptale-color-surface-base);
    border: 1px solid ${borderColor};
    border-radius: 2px;
    z-index: 10;
  `;

  const positions: Record<ResizeDirection, string> = {
    nw: 'top: -5px; left: -5px; cursor: nwse-resize;',
    n: 'top: -5px; left: calc(50% - 5px); cursor: ns-resize;',
    ne: 'top: -5px; right: -5px; cursor: nesw-resize;',
    e: 'top: calc(50% - 5px); right: -5px; cursor: ew-resize;',
    se: 'bottom: -5px; right: -5px; cursor: nwse-resize;',
    s: 'bottom: -5px; left: calc(50% - 5px); cursor: ns-resize;',
    sw: 'bottom: -5px; left: -5px; cursor: nesw-resize;',
    w: 'top: calc(50% - 5px); left: -5px; cursor: ew-resize;',
  };

  return baseStyle + positions[direction];
}
