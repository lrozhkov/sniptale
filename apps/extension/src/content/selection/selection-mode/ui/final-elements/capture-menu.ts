import { ArrowLeft, Check, ChevronRight, createElement } from 'lucide';
import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import {
  bindFloatingInteractionPositionListeners,
  resolveToolbarSurfacePlacement,
  TOOLBAR_SURFACE_GAP_PX as MENU_GAP,
} from '@sniptale/ui/floating-interactions/placement';
import {
  createProductToolbarMenuDom,
  createProductToolbarMenuItemDom,
  createProductToolbarMenuItemCopyDom,
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

const VIEWPORT_MARGIN = 8;

interface CaptureMenuLifecycleState {
  menu: HTMLElement;
  removeLifecycleListeners: () => void;
  trigger: HTMLButtonElement;
}

type CaptureActionDescriptor = ReturnType<typeof getCaptureActionDescriptors>[number];

const captureMenuStates = new WeakMap<HTMLElement, CaptureMenuLifecycleState>();
const captureMenuHeights = new WeakMap<HTMLElement, number>();

function canOpenCaptureMenuBelow(anchorRect: DOMRect, height: number): boolean {
  const below = window.innerHeight - VIEWPORT_MARGIN - anchorRect.bottom - MENU_GAP;
  const above = anchorRect.top - MENU_GAP - VIEWPORT_MARGIN;
  return below >= height || (above < height && below >= above);
}

function getCaptureMenuShellRect(trigger: HTMLElement): DOMRect {
  return (trigger.closest('.sniptale-selection-toolbar') ?? trigger).getBoundingClientRect();
}

function applyCaptureMenuDirection(trigger: HTMLElement, below: boolean): void {
  trigger.dataset['menuSide'] = below ? 'down' : 'up';
  const icon = trigger.querySelector('svg');
  if (icon) icon.style.transform = below ? 'none' : 'rotate(180deg)';
}

export function syncSelectionCaptureMenuDirection(root: ParentNode): void {
  const trigger = root.querySelector<HTMLButtonElement>('.sniptale-selection-capture-menu-trigger');
  if (!trigger) return;
  const below = canOpenCaptureMenuBelow(
    getCaptureMenuShellRect(trigger),
    captureMenuHeights.get(trigger) ?? 84
  );
  applyCaptureMenuDirection(trigger, below);
}

function positionCaptureMenu(menu: HTMLElement, anchor: HTMLElement): void {
  const anchorRect = anchor.getBoundingClientRect();
  const shellRect = getCaptureMenuShellRect(anchor);
  menu.style.maxHeight = '';
  menu.classList.remove('sniptale-toolbar-menu--compact');
  let menuRect = menu.getBoundingClientRect();
  let height = menuRect.height || 84;
  const availableAbove = shellRect.top - MENU_GAP - VIEWPORT_MARGIN;
  const availableBelow = window.innerHeight - VIEWPORT_MARGIN - shellRect.bottom - MENU_GAP;
  if (height > Math.max(availableAbove, availableBelow)) {
    menu.classList.add('sniptale-toolbar-menu--compact');
    menuRect = menu.getBoundingClientRect();
    height = menuRect.height || 84;
  }
  const width = menuRect.width || 260;
  captureMenuHeights.set(anchor, height);
  const canOpenBelow = canOpenCaptureMenuBelow(shellRect, height);
  applyCaptureMenuDirection(anchor, canOpenBelow);
  const position = resolveToolbarSurfacePlacement({
    anchor: anchorRect,
    toolbar: shellRect,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    width,
    height,
    placement: canOpenBelow ? 'down' : 'up',
    align: 'center',
  });
  menu.style.maxHeight = `${position.maxHeight}px`;
  menu.style.overflowY = 'auto';
  menu.style.left = `${position.left}px`;
  menu.style.top = `${position.top}px`;
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
  menu.classList.add('sniptale-selection-capture-menu', 'sniptale-content-menu-adopted');
  menu.dataset['ui'] = 'content.selection.capture-action-menu';
  menu.setAttribute('role', 'menu');
  menu.dataset['sniptaleActivationBridge'] = 'defer';
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
  const compact = options.getCapturePreferences().compactMenus;
  if (compact) button.classList.add('sniptale-capture-action-icon');
  button.setAttribute('role', 'menuitem');
  button.setAttribute('aria-label', descriptor.label);
  button.title = descriptor.label;
  button.tabIndex = tabIndex;
  button.append(createSelectionCaptureActionIcon(descriptor.value, 18));
  if (!compact)
    button.append(createProductToolbarMenuItemCopyDom(descriptor.label, descriptor.hint));
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeSelectionCaptureActionMenu(options.overlayContainer, false);
    options.onCaptureActionChange(descriptor.value);
    options.onConfirm(event);
  });
  return button;
}

function appendCaptureMenuActions(list: HTMLElement, options: SelectionCaptureActionOptions): void {
  const descriptors = getCaptureActionDescriptors().filter(
    (descriptor) => descriptor.value !== 'scenario'
  );
  const row = document.createElement('div');
  if (options.getCapturePreferences().compactMenus) row.className = 'sniptale-capture-action-icons';
  descriptors.forEach((descriptor, index) => {
    row.appendChild(createCaptureMenuItem(descriptor, index === 0 ? 0 : -1, options));
  });
  list.appendChild(row);
}

function installCaptureMenuKeyboardNavigation(
  menu: HTMLElement,
  overlayContainer: HTMLElement
): void {
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeSelectionCaptureActionMenu(overlayContainer, true);
      return;
    }
    const items = Array.from(
      menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"]')
    );
    const currentIndex = items.findIndex((item) => item === event.target);
    if (currentIndex < 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
      nextIndex = (currentIndex + 1) % items.length;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
      nextIndex = (currentIndex - 1 + items.length) % items.length;
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
  const reposition = () => {
    const state = captureMenuStates.get(options.overlayContainer);
    if (state?.menu === menu) positionCaptureMenu(menu, state.trigger);
  };
  const divider = () => {
    const element = document.createElement('div');
    element.className = 'sniptale-popover-divider';
    return element;
  };
  const title = menu.querySelector<HTMLElement>('.sniptale-toolbar-menu-title');
  const showActions = (restoreFocus = false) => {
    if (title) title.hidden = false;
    list.replaceChildren();
    appendCaptureMenuActions(list, options);
    const preferences = options.getCapturePreferences();
    const summary =
      preferences.imageFormat.toUpperCase() +
      (preferences.imageFormat === 'png' ? '' : ` · ${preferences.imageQuality}%`);
    const settings = createProductToolbarMenuItemDom({
      dataUi: 'content.selection.capture-parameters',
    });
    settings.setAttribute('role', 'menuitem');
    settings.tabIndex = -1;
    settings.title = translate('content.toolbar.captureParameters');
    const copy = createProductToolbarMenuItemCopyDom(summary);
    copy.style.color = 'var(--sniptale-color-text-secondary)';
    settings.append(copy, createElement(ChevronRight, { width: '16', height: '16' }));
    settings.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showFormats();
    });
    list.append(divider(), settings);
    reposition();
    if (restoreFocus) settings.focus({ preventScroll: true });
  };
  const showFormats = () => {
    if (title) title.hidden = true;
    list.replaceChildren();
    const back = createProductToolbarMenuItemDom({
      dataUi: 'content.selection.capture-parameters.back',
    });
    back.setAttribute('role', 'menuitem');
    back.tabIndex = 0;
    back.append(
      createElement(ArrowLeft, { width: '16', height: '16' }),
      createProductToolbarMenuItemCopyDom(translate('content.toolbar.selectionCaptureActionTitle'))
    );
    back.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showActions(true);
    });
    list.append(back, divider());
    for (const format of ['png', 'jpeg', 'webp'] as const) {
      const selected = options.getCapturePreferences().imageFormat === format;
      const button = createProductToolbarMenuItemDom({
        dataUi: `content.selection.capture-format.${format}`,
        selected,
      });
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = -1;
      button.append(
        createProductToolbarMenuItemCopyDom(format === 'webp' ? 'WebP' : format.toUpperCase())
      );
      if (selected) button.append(createElement(Check, { class: 'sniptale-popover-check' }));
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        options.onImageFormatChange(format);
        showFormats();
        menu
          .querySelector<HTMLButtonElement>(
            `[data-ui="content.selection.capture-format.${format}"]`
          )
          ?.focus();
      });
      list.append(button);
    }
    reposition();
    back.focus({ preventScroll: true });
  };
  showActions();
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
