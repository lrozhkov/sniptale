import { useEffect } from 'react';
import {
  getContentEventTargetElement,
  isContentEventWithinElement,
} from '../../../platform/dom-host';
import type { ToolbarCapturePopoverMenu, ToolbarPopoverMenu } from '../state/menu';

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

function getDistanceFromRect(event: MouseEvent, rect: DOMRect) {
  const closestX = Math.max(rect.left, Math.min(event.clientX, rect.right));
  const closestY = Math.max(rect.top, Math.min(event.clientY, rect.bottom));
  return Math.sqrt(Math.pow(event.clientX - closestX, 2) + Math.pow(event.clientY - closestY, 2));
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

  return getDistanceFromRect(event, resolvedMenuEl.getBoundingClientRect()) > 250;
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
