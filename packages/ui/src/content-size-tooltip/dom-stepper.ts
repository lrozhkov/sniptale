import type { ContentSizeTooltipCopy } from './core';
import {
  CONTENT_SIZE_TOOLTIP_INPUT_CLASS_NAME,
  CONTENT_SIZE_TOOLTIP_INPUT_STYLE,
  CONTENT_SIZE_TOOLTIP_STEPPER_CLASS_NAME,
  CONTENT_SIZE_TOOLTIP_STEPPER_CONTROLS_CLASS_NAME,
  CONTENT_SIZE_TOOLTIP_STEPPER_CONTROLS_STYLE,
  CONTENT_SIZE_TOOLTIP_STEPPER_STYLE,
  getContentSizeTooltipStepButtonStyle,
} from './styles';
import { applyTooltipDomStyle } from './dom-style';
import { startContentSizeTooltipStepperRepeat } from './repeat';

interface ContentSizeTooltipDomStepperGroup {
  group: HTMLDivElement;
  input: HTMLInputElement;
  decreaseButton: HTMLButtonElement;
  increaseButton: HTMLButtonElement;
}

function createChevronIcon(rotated: boolean): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('width', '12');
  icon.setAttribute('height', '12');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2.3');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', rotated ? 'm6 9 6 6 6-6' : 'm18 15-6-6-6 6');
  icon.appendChild(path);
  return icon;
}

function createStepperButton(props: {
  ariaLabel: string;
  className: string;
  target: 'width' | 'height';
  rotated?: boolean;
}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `sniptale-size-btn ${props.className}`;
  button.setAttribute('aria-label', props.ariaLabel);
  button.title = props.ariaLabel;
  button.dataset['target'] = props.target;
  button.appendChild(createChevronIcon(Boolean(props.rotated)));
  applyTooltipDomStyle(button, getContentSizeTooltipStepButtonStyle(false));
  bindRepeatingStepperButton(button);
  return button;
}

function addStepperReleaseListeners(clearTimers: () => void): void {
  window.addEventListener('mouseup', clearTimers);
  window.addEventListener('pointerup', clearTimers);
  window.addEventListener('pointercancel', clearTimers);
}

function removeStepperReleaseListeners(clearTimers: () => void): void {
  window.removeEventListener('mouseup', clearTimers);
  window.removeEventListener('pointerup', clearTimers);
  window.removeEventListener('pointercancel', clearTimers);
}

function bindRepeatingStepperButton(button: HTMLButtonElement): void {
  let stopRepeating: (() => void) | null = null;
  let suppressNextTrustedClick = false;

  const clearTimers = () => {
    if (stopRepeating) {
      stopRepeating();
      stopRepeating = null;
    }
    removeStepperReleaseListeners(clearTimers);
  };

  button.addEventListener(
    'click',
    (event) => {
      if (!suppressNextTrustedClick || !event.isTrusted) {
        return;
      }

      suppressNextTrustedClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true }
  );

  button.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || button.disabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    clearTimers();
    addStepperReleaseListeners(clearTimers);
    suppressNextTrustedClick = true;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    stopRepeating = startContentSizeTooltipStepperRepeat(() => {
      if (button.disabled) {
        clearTimers();
        return;
      }

      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  });
  button.addEventListener('blur', clearTimers);
}

function createStepperInput(props: {
  fieldLabel: string;
  inputId: string;
  min: number;
  max: number;
}): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.inputMode = 'numeric';
  input.id = props.inputId;
  input.min = String(props.min);
  input.max = String(props.max);
  input.className = `sniptale-size-input ${CONTENT_SIZE_TOOLTIP_INPUT_CLASS_NAME}`;
  input.setAttribute('aria-label', props.fieldLabel);
  input.title = props.fieldLabel;
  applyTooltipDomStyle(input, CONTENT_SIZE_TOOLTIP_INPUT_STYLE);
  return input;
}

function createStepperControls(
  increaseButton: HTMLButtonElement,
  decreaseButton: HTMLButtonElement
): HTMLDivElement {
  const controls = document.createElement('div');
  controls.className = CONTENT_SIZE_TOOLTIP_STEPPER_CONTROLS_CLASS_NAME;
  applyTooltipDomStyle(controls, CONTENT_SIZE_TOOLTIP_STEPPER_CONTROLS_STYLE);
  controls.append(increaseButton, decreaseButton);
  return controls;
}

export function createTooltipStepperGroup(props: {
  copy: ContentSizeTooltipCopy;
  dimension: 'width' | 'height';
  fieldLabel: string;
  inputId: string;
  min: number;
  max: number;
}): ContentSizeTooltipDomStepperGroup {
  const group = document.createElement('div');
  group.className = CONTENT_SIZE_TOOLTIP_STEPPER_CLASS_NAME;
  applyTooltipDomStyle(group, CONTENT_SIZE_TOOLTIP_STEPPER_STYLE);

  const input = createStepperInput(props);
  const decreaseButton = createStepperButton({
    ariaLabel: props.dimension === 'width' ? props.copy.decreaseWidth : props.copy.decreaseHeight,
    className: 'sniptale-size-btn-minus',
    target: props.dimension,
    rotated: true,
  });
  const increaseButton = createStepperButton({
    ariaLabel: props.dimension === 'width' ? props.copy.increaseWidth : props.copy.increaseHeight,
    className: 'sniptale-size-btn-plus',
    target: props.dimension,
  });

  group.append(input, createStepperControls(increaseButton, decreaseButton));
  return { group, input, decreaseButton, increaseButton };
}
