import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import type { CaptureActionType } from '../../../../../contracts/settings';
import { translate } from '../../../../../platform/i18n';
import {
  canDecreaseSelectionPadding,
  canIncreaseSelectionPadding,
} from '../../interaction/selection/padding';
import type { Selection } from '../../types';
import { createSelectionCaptureActionControls } from './capture-menu';
import { createSelectionPaddingIcon } from './icons';
import {
  applySelectionToolbarButtonChrome,
  applySelectionToolbarDividerChrome,
  applySelectionToolbarSurfaceChrome,
  createSelectionToolbarDivider,
  syncSelectionToolbarCompactControlsChrome,
} from './toolbar-chrome';

type ToolbarOptions = {
  getCaptureAction: () => CaptureActionType;
  getSelection: () => Selection;
  onAdjustPadding: (direction: 'decrease' | 'increase') => void;
  onCaptureActionChange: (action: CaptureActionType) => void;
  onConfirm: () => void;
  overlayContainer: HTMLElement;
};

function createToolbarButton(className: string, label: string, content: Node) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.title = label;
  applySelectionToolbarButtonChrome(button);
  button.appendChild(content);
  return button;
}

function createPaddingControls(options: ToolbarOptions): HTMLElement {
  const group = document.createElement('div');
  group.className = 'sniptale-selection-padding-controls';
  Object.assign(group.style, { display: 'inline-flex', alignItems: 'center', gap: '2px' });
  const decrease = createToolbarButton(
    'sniptale-selection-padding-decrease',
    translate('content.interactiveFrame.decreaseFrame'),
    createSelectionPaddingIcon('decrease')
  );
  const increase = createToolbarButton(
    'sniptale-selection-padding-increase',
    translate('content.interactiveFrame.increaseFrame'),
    createSelectionPaddingIcon('increase')
  );
  decrease.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!decrease.disabled) options.onAdjustPadding('decrease');
  });
  increase.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onAdjustPadding('increase');
  });
  group.append(decrease, increase);
  return group;
}

export function enhanceSelectionModeToolbar(
  tooltip: ContentSizeTooltipDom,
  options: ToolbarOptions
): void {
  applySelectionToolbarSurfaceChrome(tooltip.root);
  applySelectionToolbarButtonChrome(tooltip.cancelButton);
  applySelectionToolbarDividerChrome(tooltip.actions.previousElementSibling!);
  applySelectionToolbarDividerChrome(tooltip.cancelButton.previousElementSibling!);
  const paddingControls = createPaddingControls(options);
  tooltip.root.insertBefore(paddingControls, tooltip.actions);
  tooltip.root.insertBefore(createSelectionToolbarDivider(), tooltip.actions);
  createSelectionCaptureActionControls(tooltip, options);
  syncSelectionToolbarCompactControlsChrome(tooltip);
  syncSelectionToolbarPaddingState(tooltip.root, options.getSelection());
}

export function syncSelectionToolbarPaddingState(root: ParentNode, selection: Selection): void {
  const decrease = root.querySelector<HTMLButtonElement>('.sniptale-selection-padding-decrease');
  const increase = root.querySelector<HTMLButtonElement>('.sniptale-selection-padding-increase');
  if (decrease) decrease.disabled = !canDecreaseSelectionPadding(selection);
  if (increase) {
    increase.disabled = !canIncreaseSelectionPadding(selection, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }
}
