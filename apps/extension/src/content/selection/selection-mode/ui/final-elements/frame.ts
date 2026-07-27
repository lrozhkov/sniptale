import type { ResizeDirection } from '../dom-types';
import type { SelectionModeFinalElementsOptions } from '../types';
import { getSelectionFinalFrameStyle } from '../style';

export function createSelectionModeFinalFrame(
  options: SelectionModeFinalElementsOptions
): HTMLElement {
  const finalFrame = document.createElement('div');
  finalFrame.className = 'sniptale-selection-final-frame';
  finalFrame.style.cssText = getSelectionFinalFrameStyle(options.visual, options.zIndexBase);
  return finalFrame;
}

export function createSelectionModeFinalResizeHandles(
  finalFrame: HTMLElement,
  borderColor: string,
  borderWidth: number
): void {
  const handleSize = Math.min(16, Math.max(10, 8 + borderWidth));
  const directions: ResizeDirection[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  directions.forEach((direction) => {
    const handle = document.createElement('div');
    handle.className = `sniptale-resize-handle sniptale-resize-${direction}`;
    handle.dataset['direction'] = direction;
    handle.setAttribute('aria-hidden', 'true');
    handle.style.cssText = getResizeHandleStyle(direction, borderColor, handleSize);
    finalFrame.appendChild(handle);
  });
}

function getResizeHandleStyle(
  direction: ResizeDirection,
  borderColor: string,
  handleSize: number
): string {
  const halfHandle = handleSize / 2;
  const edgeOffset = halfHandle;
  const baseStyle = `
    position: absolute;
    width: ${handleSize}px;
    height: ${handleSize}px;
    box-sizing: border-box;
    background: #ffffff;
    border: 1px solid color-mix(in srgb, ${borderColor} 46%, var(--sniptale-color-border-soft));
    border-radius: 50%;
    box-shadow: 0 1px 4px color-mix(in srgb, var(--sniptale-color-shadow-strong) 22%, transparent);
    z-index: 10;
  `;

  const positions: Record<ResizeDirection, string> = {
    nw: `top: -${edgeOffset}px; left: -${edgeOffset}px; cursor: nwse-resize;`,
    n: `top: -${edgeOffset}px; left: calc(50% - ${halfHandle}px); cursor: ns-resize;`,
    ne: `top: -${edgeOffset}px; right: -${edgeOffset}px; cursor: nesw-resize;`,
    e: `top: calc(50% - ${halfHandle}px); right: -${edgeOffset}px; cursor: ew-resize;`,
    se: `bottom: -${edgeOffset}px; right: -${edgeOffset}px; cursor: nwse-resize;`,
    s: `bottom: -${edgeOffset}px; left: calc(50% - ${halfHandle}px); cursor: ns-resize;`,
    sw: `bottom: -${edgeOffset}px; left: -${edgeOffset}px; cursor: nesw-resize;`,
    w: `top: calc(50% - ${halfHandle}px); left: -${edgeOffset}px; cursor: ew-resize;`,
  };

  return baseStyle + positions[direction];
}
