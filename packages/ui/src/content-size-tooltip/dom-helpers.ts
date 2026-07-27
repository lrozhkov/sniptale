import type { ContentSizeTooltipCopy } from './core';
import type { ContentSizeTooltipVariant } from './types';
import {
  CONTENT_SIZE_TOOLTIP_ACTIONS_STYLE,
  CONTENT_SIZE_TOOLTIP_DIVIDER_STYLE,
  CONTENT_SIZE_TOOLTIP_INPUT_STYLE_TEXT,
  CONTENT_SIZE_TOOLTIP_PRIMARY_ACTION_CLASS_NAME,
  CONTENT_SIZE_TOOLTIP_RATIO_BUTTON_CLASS_NAME,
  getContentSizeTooltipSurfaceStyle,
  getContentSizeTooltipActionButtonStyle,
  getContentSizeTooltipRatioButtonStyle,
} from './styles';
import { applyTooltipDomStyle, type ContentSizeTooltipStyleRecord } from './dom-style';
export { applyTooltipDomStyle } from './dom-style';
export { createTooltipStepperGroup } from './dom-stepper';

function createLink2Icon(): SVGSVGElement {
  const icon = createTooltipSvgIcon({
    paths: ['M9 17H7A5 5 0 0 1 7 7h2', 'M15 7h2a5 5 0 1 1 0 10h-2'],
  });
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '8');
  line.setAttribute('x2', '16');
  line.setAttribute('y1', '12');
  line.setAttribute('y2', '12');
  icon.appendChild(line);
  return icon;
}

function createLinkIcon(): SVGSVGElement {
  return createTooltipSvgIcon({
    paths: [
      'M10 13a5 5 0 0 0 7.54.54l2.92-2.92a5 5 0 0 0-7.07-7.08L11.7 5.23',
      'M14 11a5 5 0 0 0-7.54-.54L3.54 13.38a5 5 0 0 0 7.07 7.08l1.69-1.69',
    ],
  });
}

function createActionIcon(kind: 'cancel' | 'confirm'): SVGSVGElement {
  return createTooltipSvgIcon({
    paths: kind === 'cancel' ? ['M18 6 6 18', 'm6 6 12 12'] : ['m20 6-11 11-5-5'],
    size: 16,
  });
}

function createTooltipSvgIcon(args: { paths: string[]; size?: number; transform?: string }) {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const size = String(args.size ?? 14);
  icon.setAttribute('width', size);
  icon.setAttribute('height', size);
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');

  if (args.transform) {
    icon.style.transform = args.transform;
  }

  args.paths.forEach((pathValue) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathValue);
    icon.appendChild(path);
  });

  return icon;
}

function createTooltipButton(props: {
  ariaLabel: string;
  className?: string;
  content?: Node | string;
  style: ContentSizeTooltipStyleRecord;
}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = props.className ?? '';
  button.setAttribute('aria-label', props.ariaLabel);
  button.title = props.ariaLabel;
  applyTooltipDomStyle(button, props.style);

  if (typeof props.content === 'string') {
    button.textContent = props.content;
  } else if (props.content) {
    button.appendChild(props.content);
  }

  return button;
}

export function ensureTooltipInputStyles(root: HTMLElement) {
  if (root.querySelector('[data-sniptale-content-size-tooltip-style]')) {
    return;
  }

  const style = document.createElement('style');
  style.dataset['sniptaleContentSizeTooltipStyle'] = 'true';
  style.textContent = CONTENT_SIZE_TOOLTIP_INPUT_STYLE_TEXT;
  root.prepend(style);
}

export function createTooltipSurface(variant: ContentSizeTooltipVariant = 'default') {
  const root = document.createElement('div');
  root.className = 'sniptale-content-size-tooltip';
  root.dataset['variant'] = variant;
  applyTooltipDomStyle(root, getContentSizeTooltipSurfaceStyle(variant));
  root.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  });
  root.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  return root;
}

export function createTooltipRatioButton(
  copy: ContentSizeTooltipCopy,
  disabled: boolean,
  variant: ContentSizeTooltipVariant = 'default'
) {
  const button = createTooltipButton({
    ariaLabel: copy.keepAspectRatio,
    className: `sniptale-selection-size-ratio-button ${CONTENT_SIZE_TOOLTIP_RATIO_BUTTON_CLASS_NAME}`,
    content: variant === 'frame-edit' ? createLink2Icon() : createLinkIcon(),
    style: getContentSizeTooltipRatioButtonStyle({ active: false, disabled, variant }),
  }) as HTMLButtonElement;
  button.setAttribute('aria-pressed', 'false');
  button.dataset['variant'] = variant;
  button.disabled = disabled;
  return button;
}

export function createTooltipActions(
  copy: ContentSizeTooltipCopy,
  confirmLabel?: string,
  variant: ContentSizeTooltipVariant = 'default'
) {
  const actions = document.createElement('div');
  applyTooltipDomStyle(actions, CONTENT_SIZE_TOOLTIP_ACTIONS_STYLE);
  const compact = variant === 'frame-edit';

  const cancelButton = createTooltipButton({
    ariaLabel: copy.cancel,
    className: 'sniptale-selection-size-cancel-button',
    content: compact ? createActionIcon('cancel') : copy.cancel,
    style: getContentSizeTooltipActionButtonStyle('neutral', variant),
  }) as HTMLButtonElement;
  const confirmButton = createTooltipButton({
    ariaLabel: confirmLabel ?? copy.confirm,
    className: `sniptale-selection-size-confirm-button ${CONTENT_SIZE_TOOLTIP_PRIMARY_ACTION_CLASS_NAME}`,
    content: compact ? createActionIcon('confirm') : (confirmLabel ?? copy.confirm),
    style: getContentSizeTooltipActionButtonStyle('accent', variant),
  }) as HTMLButtonElement;

  if (compact) actions.append(confirmButton, createTooltipDivider(), cancelButton);
  else actions.append(cancelButton, confirmButton);
  return { actions, cancelButton, confirmButton };
}

export function createTooltipDivider() {
  const divider = document.createElement('span');
  divider.setAttribute('aria-hidden', 'true');
  applyTooltipDomStyle(divider, CONTENT_SIZE_TOOLTIP_DIVIDER_STYLE);
  return divider;
}
