import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import { getContentSizeTooltipActionButtonStyle } from '@sniptale/ui/content-size-tooltip/styles';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import {
  createProductToolbarMenuDom,
  createProductToolbarMenuItemCopyDom,
  createProductToolbarMenuItemDom,
} from '@sniptale/ui/product-menus/toolbar/dom';
import type { CaptureActionType } from '../../../../../contracts/settings';
import { translate } from '../../../../../platform/i18n';
import { isContentEventWithinAnyElement } from '../../../../platform/dom-host';
import { getCaptureActionDescriptors } from '../../../../../features/quick-actions-presets/catalog';

const MENU_GAP = 8;
const VIEWPORT_MARGIN = 8;
const CAPTURE_MENU_ID = 'sniptale-selection-capture-action-menu';
const CAPTURE_BUTTON_STYLE = getContentSizeTooltipActionButtonStyle('neutral', 'frame-edit');

interface CaptureMenuLifecycleState {
  menu: HTMLElement;
  removeLifecycleListeners: () => void;
  trigger: HTMLButtonElement;
}

interface CaptureActionControlsOptions {
  getCaptureAction: () => CaptureActionType;
  onCaptureActionChange: (action: CaptureActionType) => void;
  onConfirm: () => void;
  overlayContainer: HTMLElement;
}

type CaptureActionDescriptor = ReturnType<typeof getCaptureActionDescriptors>[number];

const captureMenuStates = new WeakMap<HTMLElement, CaptureMenuLifecycleState>();

const ACTION_ICON_PATHS: Record<CaptureActionType, string[]> = {
  download_default: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  ask_preset: [
    [
      'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9',
      'L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
    ].join(''),
    'M12 10v6',
    'm9 13 3-3 3 3',
  ],
  ask_system: [
    'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z',
    'M17 21v-8H7v8',
    'M7 3v5h8',
  ],
  copy: ['M8 8h12v12H8z', 'M16 8V4H4v12h4'],
  scenario: [
    'M8 2v4',
    'M16 2v4',
    'M3 10h18',
    'M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',
    'M8 14h.01',
    'M12 14h.01',
    'M16 14h.01',
    'M8 18h.01',
    'M12 18h.01',
  ],
  edit: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'],
};

function createSvg(paths: string[], size = 16): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('width', String(size));
  icon.setAttribute('height', String(size));
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.style.display = 'block';
  paths.forEach((pathValue) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathValue);
    icon.appendChild(path);
  });
  return icon;
}

function createCaptureMenuTrigger(): HTMLButtonElement {
  const label = translate('content.toolbar.selectionCaptureActionTitle');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sniptale-selection-capture-menu-trigger';
  button.setAttribute('aria-controls', CAPTURE_MENU_ID);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-label', label);
  button.title = label;
  Object.assign(button.style, CAPTURE_BUTTON_STYLE, {
    width: '22px',
    minWidth: '22px',
    borderRadius: '0 8px 8px 0',
  });
  button.appendChild(createSvg(['m6 9 6 6 6-6'], 14));
  return button;
}

function positionCaptureMenu(menu: HTMLElement, anchor: HTMLElement): void {
  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const width = menuRect.width || 280;
  const height = menuRect.height || 284;
  const left = Math.min(
    Math.max(anchorRect.left + anchorRect.width / 2 - width / 2, VIEWPORT_MARGIN),
    Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
  );
  const canOpenBelow =
    anchorRect.bottom + MENU_GAP + height <= window.innerHeight - VIEWPORT_MARGIN;
  const top = canOpenBelow
    ? anchorRect.bottom + MENU_GAP
    : Math.max(VIEWPORT_MARGIN, anchorRect.top - MENU_GAP - height);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function createCaptureMenuSurface(): {
  list: HTMLElement;
  menu: HTMLElement;
} {
  const { root: menu, list } = createProductToolbarMenuDom({
    title: translate('content.toolbar.selectionCaptureActionTitle'),
    variant: 'capture',
  });
  menu.id = CAPTURE_MENU_ID;
  menu.classList.add('sniptale-selection-capture-menu');
  menu.dataset['ui'] = 'content.selection.capture-action-menu';
  menu.setAttribute('role', 'menu');
  Object.assign(menu.style, {
    position: 'fixed',
    right: 'auto',
    bottom: 'auto',
    pointerEvents: 'auto',
    zIndex: '2147483647',
  });
  return { list, menu };
}

function createCaptureMenuItem(
  descriptor: CaptureActionDescriptor,
  tabIndex: number,
  options: CaptureActionControlsOptions
): HTMLButtonElement {
  const button = createProductToolbarMenuItemDom({
    dataUi: `content.selection.capture-action-option.${descriptor.value}`,
  });
  button.setAttribute('role', 'menuitem');
  button.tabIndex = tabIndex;
  button.append(
    createSvg(ACTION_ICON_PATHS[descriptor.value], 18),
    createProductToolbarMenuItemCopyDom(descriptor.label, descriptor.hint)
  );
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeSelectionCaptureActionMenu(options.overlayContainer, false);
    options.onCaptureActionChange(descriptor.value);
    options.onConfirm();
  });
  return button;
}

function appendCaptureMenuActions(list: HTMLElement, options: CaptureActionControlsOptions): void {
  const descriptors = getCaptureActionDescriptors().filter(
    (descriptor) => descriptor.value !== 'scenario'
  );
  descriptors.forEach((descriptor, index) => {
    list.appendChild(createCaptureMenuItem(descriptor, index === 0 ? 0 : -1, options));
  });
}

function installCaptureMenuKeyboardNavigation(
  menu: HTMLElement,
  overlayContainer: HTMLElement
): void {
  menu.addEventListener('keydown', (event) => {
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const currentIndex = items.findIndex((item) => item === event.target);
    if (currentIndex < 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (event.key === 'Tab') {
      closeSelectionCaptureActionMenu(overlayContainer, false);
      return;
    }
    if (nextIndex === null) return;

    event.preventDefault();
    event.stopPropagation();
    items.forEach((item, index) => {
      item.tabIndex = index === nextIndex ? 0 : -1;
    });
    items[nextIndex]?.focus();
  });
}

function createCaptureMenu(options: CaptureActionControlsOptions): HTMLElement {
  const { list, menu } = createCaptureMenuSurface();
  appendCaptureMenuActions(list, options);
  installCaptureMenuKeyboardNavigation(menu, options.overlayContainer);
  return menu;
}

function installOutsideDismissal(
  overlayContainer: HTMLElement,
  menu: HTMLElement,
  trigger: HTMLButtonElement
): () => void {
  const handleOutsideMouseDown = (event: MouseEvent) => {
    if (isContentEventWithinAnyElement(event, [menu, trigger])) return;
    closeSelectionCaptureActionMenu(overlayContainer, false);
  };
  document.addEventListener('mousedown', handleOutsideMouseDown, true);
  return () => document.removeEventListener('mousedown', handleOutsideMouseDown, true);
}

function installCaptureMenuLifecycle(
  overlayContainer: HTMLElement,
  menu: HTMLElement,
  trigger: HTMLButtonElement
): () => void {
  const removeOutsideListener = installOutsideDismissal(overlayContainer, menu, trigger);
  const removePositionListeners = bindFloatingInteractionPositionListeners(trigger, () => {
    positionCaptureMenu(menu, trigger);
  });

  return () => {
    removeOutsideListener();
    removePositionListeners?.();
  };
}

function openSelectionCaptureActionMenu(
  options: CaptureActionControlsOptions,
  trigger: HTMLButtonElement
): void {
  const menu = createCaptureMenu(options);
  options.overlayContainer.appendChild(menu);
  trigger.setAttribute('aria-expanded', 'true');
  captureMenuStates.set(options.overlayContainer, {
    menu,
    trigger,
    removeLifecycleListeners: installCaptureMenuLifecycle(options.overlayContainer, menu, trigger),
  });
  menu.querySelector<HTMLButtonElement>('[role="menuitem"][tabindex="0"]')?.focus();
}

export function closeSelectionCaptureActionMenu(
  overlayContainer: HTMLElement | null,
  restoreFocus: boolean
): boolean {
  if (!overlayContainer) return false;
  const state = captureMenuStates.get(overlayContainer);
  if (!state) return false;
  state.removeLifecycleListeners();
  state.menu.remove();
  state.trigger.setAttribute('aria-expanded', 'false');
  captureMenuStates.delete(overlayContainer);
  if (restoreFocus && state.trigger.isConnected) state.trigger.focus();
  return true;
}

export function createSelectionCaptureActionControls(
  tooltip: ContentSizeTooltipDom,
  options: CaptureActionControlsOptions
): void {
  const action = options.getCaptureAction();
  const descriptor = getCaptureActionDescriptors().find((item) => item.value === action);
  tooltip.confirmButton.replaceChildren(createSvg(ACTION_ICON_PATHS[action]));
  tooltip.confirmButton.dataset['captureAction'] = action;
  tooltip.confirmButton.setAttribute(
    'aria-label',
    descriptor?.label ?? tooltip.confirmButton.title
  );
  tooltip.confirmButton.title = descriptor?.label ?? tooltip.confirmButton.title;
  tooltip.confirmButton.style.borderRadius = '8px 0 0 8px';

  const trigger = createCaptureMenuTrigger();
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (closeSelectionCaptureActionMenu(options.overlayContainer, false)) return;
    openSelectionCaptureActionMenu(options, trigger);
  });

  const splitGroup = document.createElement('div');
  splitGroup.className = 'sniptale-selection-capture-split-action';
  Object.assign(splitGroup.style, { display: 'inline-flex', alignItems: 'center', gap: '1px' });
  tooltip.actions.insertBefore(splitGroup, tooltip.confirmButton);
  splitGroup.append(tooltip.confirmButton, trigger);
}
