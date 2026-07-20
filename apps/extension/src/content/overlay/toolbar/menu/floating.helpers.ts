import { useEffect, type CSSProperties, type RefObject } from 'react';
import { isContentEventWithinElement } from '../../../platform/dom-host';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import type { ProductToolbarMenuPlacement } from '@sniptale/ui/product-menus/toolbar';

const TOOLBAR_MENU_GAP_PX = 10;
const TOOLBAR_MENU_VIEWPORT_MARGIN_PX = 8;

function clampValue(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function isMenuEventWithinRefs(event: Event, refs: Array<RefObject<HTMLElement | null>>) {
  return refs.some((ref) => isContentEventWithinElement(event, ref.current));
}

export function resolveToolbarMenuPlacement(
  displayMode: ContentToolbarDisplayMode,
  placement: 'up' | 'down'
): ProductToolbarMenuPlacement {
  return displayMode === 'vertical' ? 'side' : placement;
}

export function resolveToolbarFloatingMenuStyle(params: {
  anchorEl: HTMLElement | null;
  displayMode?: ContentToolbarDisplayMode;
  menuHeight?: number;
  menuWidth: number;
  placement: 'up' | 'down';
  preferredAlign?: 'start' | 'end';
  viewportRightInset?: number;
}): CSSProperties | null {
  const {
    anchorEl,
    displayMode = 'horizontal',
    menuHeight = 280,
    menuWidth,
    placement,
    preferredAlign = 'start',
    viewportRightInset = 0,
  } = params;

  if (!anchorEl) {
    return null;
  }

  const anchorRect = anchorEl.getBoundingClientRect();

  if (displayMode === 'vertical') {
    return resolveVerticalToolbarFloatingMenuStyle({
      anchorRect,
      menuHeight,
      menuWidth,
      viewportRightInset,
    });
  }

  return resolveHorizontalToolbarFloatingMenuStyle({
    anchorRect,
    menuWidth,
    placement,
    preferredAlign,
    viewportRightInset,
  });
}

function resolveHorizontalToolbarFloatingMenuStyle(args: {
  anchorRect: DOMRect;
  menuWidth: number;
  placement: 'up' | 'down';
  preferredAlign: 'start' | 'end';
  viewportRightInset: number;
}): CSSProperties {
  const minLeft = TOOLBAR_MENU_VIEWPORT_MARGIN_PX - args.anchorRect.left;
  const maxLeft =
    window.innerWidth -
    args.viewportRightInset -
    TOOLBAR_MENU_VIEWPORT_MARGIN_PX -
    args.anchorRect.left -
    args.menuWidth;
  const defaultLeft = args.preferredAlign === 'end' ? args.anchorRect.width - args.menuWidth : 0;
  const left = clampValue(defaultLeft, minLeft, maxLeft);

  if (args.placement === 'up') {
    return {
      bottom: `calc(100% + ${TOOLBAR_MENU_GAP_PX}px)`,
      left,
      top: 'auto',
    };
  }

  return {
    left,
    top: `calc(100% + ${TOOLBAR_MENU_GAP_PX}px)`,
  };
}

function resolveVerticalToolbarFloatingMenuStyle(args: {
  anchorRect: DOMRect;
  menuHeight: number;
  menuWidth: number;
  viewportRightInset: number;
}): CSSProperties {
  const spaceRight =
    window.innerWidth -
    args.viewportRightInset -
    args.anchorRect.right -
    TOOLBAR_MENU_VIEWPORT_MARGIN_PX;
  const spaceLeft = args.anchorRect.left - TOOLBAR_MENU_VIEWPORT_MARGIN_PX;
  const top = resolveVerticalToolbarFloatingMenuTop(args.anchorRect, args.menuHeight);

  if (spaceRight >= args.menuWidth || spaceRight >= spaceLeft) {
    return {
      left: `calc(100% + ${TOOLBAR_MENU_GAP_PX}px)`,
      top,
    };
  }

  return {
    left: 'auto',
    right: `calc(100% + ${TOOLBAR_MENU_GAP_PX}px)`,
    top,
  };
}

function resolveVerticalToolbarFloatingMenuTop(anchorRect: DOMRect, menuHeight: number): number {
  const minTop = TOOLBAR_MENU_VIEWPORT_MARGIN_PX - anchorRect.top;
  const maxTop = window.innerHeight - TOOLBAR_MENU_VIEWPORT_MARGIN_PX - anchorRect.top - menuHeight;

  return clampValue(0, minTop, maxTop);
}

function bindToolbarFloatingMenuDismissalHandlers(handlers: {
  handleEscape: (event: KeyboardEvent) => void;
  handleFocusIn: (event: FocusEvent) => void;
  handlePointerDown: (event: PointerEvent) => void;
  handleViewportChange: () => void;
}): () => void {
  document.addEventListener('pointerdown', handlers.handlePointerDown, true);
  document.addEventListener('focusin', handlers.handleFocusIn, true);
  window.addEventListener('keydown', handlers.handleEscape, true);
  window.addEventListener('resize', handlers.handleViewportChange);
  window.addEventListener('scroll', handlers.handleViewportChange, true);

  return () => {
    document.removeEventListener('pointerdown', handlers.handlePointerDown, true);
    document.removeEventListener('focusin', handlers.handleFocusIn, true);
    window.removeEventListener('keydown', handlers.handleEscape, true);
    window.removeEventListener('resize', handlers.handleViewportChange);
    window.removeEventListener('scroll', handlers.handleViewportChange, true);
  };
}

export function useToolbarFloatingMenuDismissal(params: {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  menuRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const { open, triggerRef, menuRef, onClose } = params;

  useEffect(() => {
    if (!open) {
      return;
    }

    const refs = [triggerRef, menuRef];

    const handlePointerDown = (event: PointerEvent) => {
      if (!isMenuEventWithinRefs(event, refs)) {
        onClose();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isMenuEventWithinRefs(event, refs)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleViewportChange = () => {
      onClose();
    };

    return bindToolbarFloatingMenuDismissalHandlers({
      handleEscape,
      handleFocusIn,
      handlePointerDown,
      handleViewportChange,
    });
  }, [menuRef, onClose, open, triggerRef]);
}
