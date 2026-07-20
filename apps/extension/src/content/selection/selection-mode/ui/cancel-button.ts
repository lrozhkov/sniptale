import { translate } from '../../../../platform/i18n';
import type { SelectionModeDom } from './dom-types';

const CANCEL_BUTTON_CLASS_NAME = 'sniptale-selection-cancel-button';

function createCancelIcon() {
  const icon = document.createElement('span');
  icon.className = 'sniptale-selection-cancel-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.style.cssText = `
    position: relative;
    display: block;
    width: 16px;
    height: 16px;
    pointer-events: none;
  `;

  ['rotate(45deg)', 'rotate(-45deg)'].forEach((transform) => {
    const bar = document.createElement('span');
    bar.style.cssText = `
      position: absolute;
      top: 7px;
      left: 2px;
      width: 12px;
      height: 2px;
      border-radius: 9999px;
      background: currentColor;
      transform: ${transform};
      transform-origin: center;
    `;
    icon.appendChild(bar);
  });

  return icon;
}

function createSelectionModeCancelButton(args: {
  cancelSelection: () => void;
  zIndexBase: number;
}) {
  const label = translate('content.interactiveFrame.cancelScreenshot');
  const button = document.createElement('button');

  button.type = 'button';
  button.className = CANCEL_BUTTON_CLASS_NAME;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    -webkit-appearance: none;
    appearance: none;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 82%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--sniptale-color-surface-panel) 96%, transparent);
    color: var(--sniptale-color-text-primary);
    font: inherit;
    line-height: 1;
    box-shadow: 0 12px 26px color-mix(in srgb, var(--sniptale-color-shadow-strong) 18%, transparent);
    cursor: pointer;
    pointer-events: auto;
    transform-origin: center;
    z-index: ${args.zIndexBase + 1};
  `;

  button.appendChild(createCancelIcon());
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    args.cancelSelection();
  });

  return button;
}

export function ensureSelectionModeCancelButton(
  dom: SelectionModeDom,
  args: {
    cancelSelection: () => void;
    zIndexBase: number;
  }
): void {
  if (!dom.overlayContainer) {
    return;
  }

  if (dom.cancelButton && dom.overlayContainer.contains(dom.cancelButton)) {
    return;
  }

  const button = createSelectionModeCancelButton(args);
  dom.overlayContainer.appendChild(button);
  dom.cancelButton = button;
}

export function hideSelectionModeCancelButton(dom: SelectionModeDom): void {
  if (dom.cancelButton) {
    dom.cancelButton.style.display = 'none';
  }
}

export function showSelectionModeCancelButton(dom: SelectionModeDom): void {
  if (dom.cancelButton) {
    dom.cancelButton.style.display = '';
  }
}
