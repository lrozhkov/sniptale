import { useEffect } from 'react';
import { isEditableElementTarget } from '../../../../ui/keyboard/editable-target';
import { isTrustedKeyboardEvent } from '../../../platform/trusted-events';
import {
  getContentEventTargetElement,
  isContentEventWithinElement,
} from '../../../platform/dom-host';
import type { ToolbarCapturePopoverMenu, ToolbarPopoverMenu } from '../state/menu';
import {
  getPointerDistanceFromRect,
  TOOLBAR_MENU_POINTER_DISMISS_DISTANCE_PX,
} from '../menu/floating.helpers';

type MenuType = ToolbarCapturePopoverMenu | null;

function getToolbarDismissTarget(event: Event) {
  return getContentEventTargetElement(event);
}

function getResolvedToolbarMenuElement(menuEl: HTMLElement | null): HTMLElement | null {
  if (!menuEl) {
    return null;
  }

  return menuEl.matches('.sniptale-popover-menu')
    ? menuEl
    : menuEl.querySelector<HTMLElement>('.sniptale-popover-menu');
}

function isToolbarMenuInteractionTarget(target: HTMLElement | null) {
  return !!target?.closest(
    '.sniptale-popover-menu, .sniptale-capture-action-wrapper, .sniptale-timer-wrapper, .sniptale-viewport-wrapper'
  );
}

function getCurrentToolbarMenuElement(params: {
  showCaptureMenu: boolean;
  showTimerMenu: boolean;
  viewportMenuOpen: boolean;
  captureDropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  timerDropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  viewportSelectorRef: { current: { getMenuElement?: () => HTMLElement | null } | null };
}) {
  if (params.showCaptureMenu) {
    return params.captureDropdownMenuRef.current;
  }
  if (params.showTimerMenu) {
    return params.timerDropdownMenuRef.current;
  }
  if (params.viewportMenuOpen) {
    return params.viewportSelectorRef.current?.getMenuElement?.() || null;
  }
  return null;
}

function hasToolbarMenuOpen(params: {
  showCaptureMenu: boolean;
  showTimerMenu: boolean;
  viewportMenuOpen: boolean;
}) {
  return params.showCaptureMenu || params.showTimerMenu || params.viewportMenuOpen;
}

function isCapturePopoverMenu(menu: ToolbarPopoverMenu | null): menu is ToolbarCapturePopoverMenu {
  return menu === 'capture' || menu === 'timer' || menu === 'viewport';
}

function shouldDismissToolbarMenu(event: MouseEvent, menuEl: HTMLElement | null) {
  const resolvedMenuEl = getResolvedToolbarMenuElement(menuEl);
  if (!resolvedMenuEl) {
    return false;
  }

  const target = getToolbarDismissTarget(event);
  if (isToolbarMenuInteractionTarget(target)) {
    return false;
  }

  return (
    getPointerDistanceFromRect(event, resolvedMenuEl.getBoundingClientRect()) >
    TOOLBAR_MENU_POINTER_DISMISS_DISTANCE_PX
  );
}

export function useToolbarFocusMenuDismissal(params: {
  activeMenuType: ToolbarPopoverMenu | null;
  closeMenus: (except?: MenuType) => void;
  viewportWrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { activeMenuType, closeMenus, viewportWrapperRef } = params;

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      if (!isCapturePopoverMenu(activeMenuType)) return;

      const target = getToolbarDismissTarget(event);
      if (!target) {
        return;
      }

      if (target.closest('.sniptale-popover-menu')) return;

      const isToolbarButton =
        target.closest('.sniptale-toolbar .sniptale-btn') &&
        !target.closest('.sniptale-popover-menu');
      const isActiveMenuButton =
        (activeMenuType === 'capture' && target.closest('.sniptale-capture-action-wrapper')) ||
        (activeMenuType === 'timer' && target.closest('.sniptale-timer-wrapper')) ||
        (activeMenuType === 'viewport' &&
          (target.closest('.sniptale-viewport-wrapper') ||
            isContentEventWithinElement(event, viewportWrapperRef.current)));

      if (isToolbarButton && !isActiveMenuButton) {
        closeMenus(null);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [activeMenuType, closeMenus, viewportWrapperRef]);
}

export function useToolbarMouseDistanceDismissal(params: {
  showCaptureMenu: boolean;
  showTimerMenu: boolean;
  viewportMenuOpen: boolean;
  closeMenus: (except?: MenuType) => void;
  captureDropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  timerDropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  viewportSelectorRef: { current: { getMenuElement?: () => HTMLElement | null } | null };
}) {
  const {
    showCaptureMenu,
    showTimerMenu,
    viewportMenuOpen,
    closeMenus,
    captureDropdownMenuRef,
    timerDropdownMenuRef,
    viewportSelectorRef,
  } = params;

  useEffect(() => {
    if (!hasToolbarMenuOpen({ showCaptureMenu, showTimerMenu, viewportMenuOpen })) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const menuEl = getCurrentToolbarMenuElement({
        showCaptureMenu,
        showTimerMenu,
        viewportMenuOpen,
        captureDropdownMenuRef,
        timerDropdownMenuRef,
        viewportSelectorRef,
      });
      if (shouldDismissToolbarMenu(event, menuEl)) {
        closeMenus(null);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [
    showCaptureMenu,
    showTimerMenu,
    viewportMenuOpen,
    closeMenus,
    captureDropdownMenuRef,
    timerDropdownMenuRef,
    viewportSelectorRef,
  ]);
}

export function useToolbarClickOutsideDismissal(params: {
  isOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  closeMenus: (except?: MenuType) => void;
}) {
  const { isOpen, menuRef, closeMenus } = params;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isContentEventWithinElement(event, menuRef.current)) {
        closeMenus(null);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, menuRef, closeMenus]);
}

/** The mounted capture menu owns digit choices; mode shortcuts yield while it is open. */
export function useCaptureMenuDigits(params: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  optionCount: number;
  onSelect(index: number): void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const index = event.key === '0' ? 9 : Number(event.key) - 1;
      const trigger = params.triggerRef.current;
      const menu = params.menuRef.current;
      if (
        !/^[0-9]$/.test(event.key) ||
        index >= params.optionCount ||
        !isTrustedKeyboardEvent(event) ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.composedPath().some(isEditableElementTarget) ||
        !menu ||
        menu.getClientRects().length === 0 ||
        getComputedStyle(menu).visibility === 'hidden' ||
        !trigger ||
        trigger.matches(':disabled') ||
        trigger.getClientRects().length === 0 ||
        getComputedStyle(trigger).visibility === 'hidden' ||
        trigger.closest('[inert], [data-page-customizing="true"], [data-dragging="true"]')
      )
        return;
      const root = trigger.getRootNode();
      if (!(root instanceof Document || root instanceof ShadowRoot)) return;
      if (
        [
          ...root.querySelectorAll<HTMLElement>(
            '[aria-modal="true"], [role="dialog"], [role="listbox"]'
          ),
        ].some(
          (layer) =>
            layer.getClientRects().length > 0 && getComputedStyle(layer).visibility !== 'hidden'
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      trigger.focus({ preventScroll: true });
      params.onSelect(index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [params]);
}
