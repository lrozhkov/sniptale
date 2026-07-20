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
