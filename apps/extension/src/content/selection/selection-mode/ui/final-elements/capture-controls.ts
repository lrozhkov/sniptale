import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import type { CaptureActionType } from '../../../../../contracts/settings';
import { getCaptureActionDescriptors } from '../../../../../features/quick-actions-presets/catalog';
import { translate } from '../../../../../platform/i18n';
import { createSelectionCaptureActionIcon, createSelectionCaptureMenuChevron } from './icons';
import { applySelectionToolbarButtonChrome } from './toolbar-chrome';

export const SELECTION_CAPTURE_MENU_ID = 'sniptale-selection-capture-action-menu';

export interface SelectionCaptureActionOptions {
  getCaptureAction: () => CaptureActionType;
  onCaptureActionChange: (action: CaptureActionType) => void;
  onConfirm: () => void;
  overlayContainer: HTMLElement;
}

function createCaptureMenuTrigger(
  onToggle: (trigger: HTMLButtonElement) => void
): HTMLButtonElement {
  const label = translate('content.toolbar.selectionCaptureActionTitle');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sniptale-selection-capture-menu-trigger';
  button.setAttribute('aria-controls', SELECTION_CAPTURE_MENU_ID);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-label', label);
  button.title = label;
  applySelectionToolbarButtonChrome(button, { split: 'end' });
  button.appendChild(createSelectionCaptureMenuChevron());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onToggle(button);
  });
  return button;
}

function configureCaptureActionButton(
  button: HTMLButtonElement,
  options: SelectionCaptureActionOptions,
  split: boolean
): void {
  const action = options.getCaptureAction();
  const descriptor = getCaptureActionDescriptors().find((item) => item.value === action);
  const label = descriptor?.label ?? button.title;
  const copy = document.createElement('span');
  copy.className = 'sniptale-selection-capture-action-label';
  copy.textContent = label;
  Object.assign(copy.style, {
    fontSize: '12px',
    fontWeight: '650',
    lineHeight: '1.2',
    whiteSpace: 'nowrap',
  });

  button.replaceChildren(createSelectionCaptureActionIcon(action), copy);
  button.dataset['captureAction'] = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  applySelectionToolbarButtonChrome(button, {
    labelled: true,
    ...(split ? { split: 'start' as const } : {}),
  });
}

export function createSelectionCaptureActionControlsDom(
  tooltip: ContentSizeTooltipDom,
  options: SelectionCaptureActionOptions,
  onMenuToggle: (trigger: HTMLButtonElement) => void
): void {
  const hasAlternatives = options.getCaptureAction() !== 'scenario';
  configureCaptureActionButton(tooltip.confirmButton, options, hasAlternatives);
  if (!hasAlternatives) return;

  const splitGroup = document.createElement('div');
  splitGroup.className = 'sniptale-selection-capture-split-action';
  Object.assign(splitGroup.style, { display: 'inline-flex', alignItems: 'center', gap: '2px' });
  tooltip.actions.insertBefore(splitGroup, tooltip.confirmButton);
  splitGroup.append(tooltip.confirmButton, createCaptureMenuTrigger(onMenuToggle));
}
