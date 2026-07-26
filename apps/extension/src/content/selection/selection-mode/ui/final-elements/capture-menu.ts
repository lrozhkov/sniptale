import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import {
  createProductToolbarMenuDom,
  createProductToolbarMenuItemCopyDom,
  createProductToolbarMenuItemDom,
} from '@sniptale/ui/product-menus/toolbar/dom';
import { translate } from '../../../../../platform/i18n';
import { isContentEventWithinAnyElement } from '../../../../platform/dom-host';
import { getCaptureActionDescriptors } from '../../../../../features/quick-actions-presets/catalog';
import {
  createSelectionCaptureActionControlsDom,
  SELECTION_CAPTURE_MENU_ID,
  type SelectionCaptureActionOptions,
} from './capture-controls';
import { createSelectionCaptureActionIcon } from './icons';

const MENU_GAP = 8;
const VIEWPORT_MARGIN = 8;

interface CaptureMenuLifecycleState {
  menu: HTMLElement;
  removeLifecycleListeners: () => void;
  trigger: HTMLButtonElement;
}

type CaptureActionDescriptor = ReturnType<typeof getCaptureActionDescriptors>[number];

const captureMenuStates = new WeakMap<HTMLElement, CaptureMenuLifecycleState>();

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
  menu.id = SELECTION_CAPTURE_MENU_ID;
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
  options: SelectionCaptureActionOptions
): HTMLButtonElement {
  const button = createProductToolbarMenuItemDom({
    dataUi: `content.selection.capture-action-option.${descriptor.value}`,
  });
  button.setAttribute('role', 'menuitem');
  button.tabIndex = tabIndex;
  button.append(
    createSelectionCaptureActionIcon(descriptor.value, 18),
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

function appendCaptureMenuActions(list: HTMLElement, options: SelectionCaptureActionOptions): void {
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

function createCaptureMenu(options: SelectionCaptureActionOptions): HTMLElement {
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
  options: SelectionCaptureActionOptions,
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
  options: SelectionCaptureActionOptions
): void {
  createSelectionCaptureActionControlsDom(tooltip, options, (trigger) => {
    if (closeSelectionCaptureActionMenu(options.overlayContainer, false)) return;
    openSelectionCaptureActionMenu(options, trigger);
  });
}
