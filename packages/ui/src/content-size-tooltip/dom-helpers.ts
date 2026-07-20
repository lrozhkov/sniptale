import type { ContentSizeTooltipCopy } from './core';
import {
  CONTENT_SIZE_TOOLTIP_ACTIONS_STYLE,
  CONTENT_SIZE_TOOLTIP_DIVIDER_STYLE,
  CONTENT_SIZE_TOOLTIP_INPUT_STYLE_TEXT,
  CONTENT_SIZE_TOOLTIP_SURFACE_STYLE,
  getContentSizeTooltipActionButtonStyle,
  getContentSizeTooltipRatioButtonStyle,
} from './styles';
import { applyTooltipDomStyle, type ContentSizeTooltipStyleRecord } from './dom-style';
export { applyTooltipDomStyle } from './dom-style';
export { createTooltipStepperGroup } from './dom-stepper';

function createLinkIcon(): SVGSVGElement {
  return createTooltipSvgIcon({
    paths: [
      'M10 13a5 5 0 0 0 7.54.54l2.92-2.92a5 5 0 0 0-7.07-7.08L11.7 5.23',
      'M14 11a5 5 0 0 0-7.54-.54L3.54 13.38a5 5 0 0 0 7.07 7.08l1.69-1.69',
    ],
  });
}

function createTooltipSvgIcon(args: { paths: string[]; transform?: string }) {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('width', '14');
  icon.setAttribute('height', '14');
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

export function createTooltipSurface() {
  const root = document.createElement('div');
  root.className = 'sniptale-content-size-tooltip';
  applyTooltipDomStyle(root, CONTENT_SIZE_TOOLTIP_SURFACE_STYLE);
  root.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  });
  root.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  return root;
}

export function createTooltipRatioButton(copy: ContentSizeTooltipCopy, disabled: boolean) {
  const button = createTooltipButton({
    ariaLabel: copy.keepAspectRatio,
    className: 'sniptale-selection-size-ratio-button',
    content: createLinkIcon(),
    style: getContentSizeTooltipRatioButtonStyle({ active: false, disabled }),
  }) as HTMLButtonElement;
  button.setAttribute('aria-pressed', 'false');
  button.disabled = disabled;
  return button;
}

export function createTooltipActions(copy: ContentSizeTooltipCopy, confirmLabel?: string) {
  const actions = document.createElement('div');
  applyTooltipDomStyle(actions, CONTENT_SIZE_TOOLTIP_ACTIONS_STYLE);

  const cancelButton = createTooltipButton({
    ariaLabel: copy.cancel,
    className: 'sniptale-selection-size-cancel-button',
    content: copy.cancel,
    style: getContentSizeTooltipActionButtonStyle('neutral'),
  }) as HTMLButtonElement;
  const confirmButton = createTooltipButton({
    ariaLabel: confirmLabel ?? copy.confirm,
    className: 'sniptale-selection-size-confirm-button',
    content: confirmLabel ?? copy.confirm,
    style: getContentSizeTooltipActionButtonStyle('accent'),
  }) as HTMLButtonElement;

  actions.append(cancelButton, confirmButton);
  return { actions, cancelButton, confirmButton };
}

export function createTooltipDivider() {
  const divider = document.createElement('span');
  divider.setAttribute('aria-hidden', 'true');
  applyTooltipDomStyle(divider, CONTENT_SIZE_TOOLTIP_DIVIDER_STYLE);
  return divider;
}
