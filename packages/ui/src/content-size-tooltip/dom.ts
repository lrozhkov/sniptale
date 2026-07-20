import type { ContentSizeTooltipCopy } from './core';
import { mergeStyleRecords } from './core';
import {
  CONTENT_SIZE_TOOLTIP_SURFACE_STYLE,
  getContentSizeTooltipRatioButtonStyle,
  getContentSizeTooltipStepButtonStyle,
} from './styles';
import {
  applyTooltipDomStyle,
  createTooltipActions,
  createTooltipDivider,
  createTooltipRatioButton,
  createTooltipStepperGroup,
  createTooltipSurface,
  ensureTooltipInputStyles,
} from './dom-helpers';

export interface ContentSizeTooltipDom {
  root: HTMLDivElement;
  widthInput: HTMLInputElement;
  heightInput: HTMLInputElement;
  widthDecreaseButton: HTMLButtonElement;
  widthIncreaseButton: HTMLButtonElement;
  heightDecreaseButton: HTMLButtonElement;
  heightIncreaseButton: HTMLButtonElement;
  aspectRatioButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  confirmButton: HTMLButtonElement;
}

function createTooltipDomParts(props: {
  copy: ContentSizeTooltipCopy;
  canToggleAspectRatio?: boolean;
  confirmLabel?: string;
  widthMin: number;
  widthMax: number;
  heightMin: number;
  heightMax: number;
}) {
  return {
    width: createTooltipStepperGroup({
      copy: props.copy,
      dimension: 'width',
      fieldLabel: props.copy.widthField,
      inputId: 'sniptale-width-input',
      min: props.widthMin,
      max: props.widthMax,
    }),
    height: createTooltipStepperGroup({
      copy: props.copy,
      dimension: 'height',
      fieldLabel: props.copy.heightField,
      inputId: 'sniptale-height-input',
      min: props.heightMin,
      max: props.heightMax,
    }),
    aspectRatioButton: createTooltipRatioButton(props.copy, props.canToggleAspectRatio === false),
    ...createTooltipActions(props.copy, props.confirmLabel),
  };
}

export function createContentSizeTooltipDom(props: {
  copy: ContentSizeTooltipCopy;
  canToggleAspectRatio?: boolean;
  confirmLabel?: string;
  heightMax: number;
  heightMin: number;
  maintainAspectRatio: boolean;
  mountInto: HTMLElement;
  widthMax: number;
  widthMin: number;
}) {
  ensureTooltipInputStyles(props.mountInto);

  const root = createTooltipSurface();
  const parts = createTooltipDomParts(props);
  syncContentSizeTooltipAspectRatioButtonState(parts.aspectRatioButton, {
    canToggleAspectRatio: props.canToggleAspectRatio,
    maintainAspectRatio: props.maintainAspectRatio,
  });

  root.append(
    parts.width.group,
    parts.aspectRatioButton,
    parts.height.group,
    createTooltipDivider(),
    parts.actions
  );

  props.mountInto.appendChild(root);

  return {
    root,
    widthInput: parts.width.input,
    heightInput: parts.height.input,
    widthDecreaseButton: parts.width.decreaseButton,
    widthIncreaseButton: parts.width.increaseButton,
    heightDecreaseButton: parts.height.decreaseButton,
    heightIncreaseButton: parts.height.increaseButton,
    aspectRatioButton: parts.aspectRatioButton,
    cancelButton: parts.cancelButton,
    confirmButton: parts.confirmButton,
  } satisfies ContentSizeTooltipDom;
}

export function setContentSizeTooltipPosition(
  tooltip: HTMLElement,
  position: { x: number; y: number }
) {
  applyTooltipDomStyle(
    tooltip,
    mergeStyleRecords(CONTENT_SIZE_TOOLTIP_SURFACE_STYLE, {
      top: `${position.y}px`,
      left: `${position.x}px`,
    })
  );
}

export function syncContentSizeTooltipValues(props: {
  tooltip: ContentSizeTooltipDom;
  width: number;
  height: number;
  maintainAspectRatio: boolean;
  widthMin?: number;
  widthMax?: number;
  heightMin?: number;
  heightMax?: number;
  canToggleAspectRatio?: boolean;
}) {
  syncTooltipInputValue(props.tooltip.widthInput, props.width);
  syncTooltipInputValue(props.tooltip.heightInput, props.height);
  syncStepperButtonState(
    props.tooltip.widthDecreaseButton,
    props.widthMin !== undefined && Math.round(props.width) <= props.widthMin
  );
  syncStepperButtonState(
    props.tooltip.widthIncreaseButton,
    props.widthMax !== undefined && Math.round(props.width) >= props.widthMax
  );
  syncStepperButtonState(
    props.tooltip.heightDecreaseButton,
    props.heightMin !== undefined && Math.round(props.height) <= props.heightMin
  );
  syncStepperButtonState(
    props.tooltip.heightIncreaseButton,
    props.heightMax !== undefined && Math.round(props.height) >= props.heightMax
  );
  syncContentSizeTooltipAspectRatioButtonState(props.tooltip.aspectRatioButton, {
    canToggleAspectRatio: props.canToggleAspectRatio,
    maintainAspectRatio: props.maintainAspectRatio,
  });
}

function syncTooltipInputValue(input: HTMLInputElement, value: number): void {
  input.value = Math.round(value).toString();
}

export function syncContentSizeTooltipAspectRatioButtonState(
  button: HTMLButtonElement,
  props: {
    maintainAspectRatio: boolean;
    canToggleAspectRatio?: boolean | undefined;
  }
) {
  const disabled = props.canToggleAspectRatio === false;
  button.setAttribute('aria-pressed', disabled ? 'false' : String(props.maintainAspectRatio));
  button.disabled = disabled;
  applyTooltipDomStyle(
    button,
    getContentSizeTooltipRatioButtonStyle({
      active: props.maintainAspectRatio,
      disabled,
    })
  );
}

function syncStepperButtonState(button: HTMLButtonElement, disabled: boolean) {
  button.disabled = disabled;
  applyTooltipDomStyle(button, getContentSizeTooltipStepButtonStyle(disabled));
}
