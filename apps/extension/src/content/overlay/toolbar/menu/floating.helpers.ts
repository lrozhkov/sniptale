import { useEffect, type CSSProperties, type RefObject } from 'react';
import { isContentEventWithinElement } from '../../../platform/dom-host';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import type { ProductToolbarMenuPlacement } from '@sniptale/ui/product-menus/toolbar';
import {
  projectClientRectToContentUi,
  readContentUiScaleCompensation,
  resolveContentUiViewport,
} from '@sniptale/ui/floating-interactions/scale';
import { registerToolbarMenuEscapeOwner } from '../state/menu';

const TOOLBAR_MENU_GAP_PX = 10;
export const TOOLBAR_MENU_POINTER_DISMISS_DISTANCE_PX = 250;
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

export function getPointerDistanceFromRect(event: MouseEvent, rect: DOMRect): number {
  const closestX = Math.max(rect.left, Math.min(event.clientX, rect.right));
  const closestY = Math.max(rect.top, Math.min(event.clientY, rect.bottom));
  return Math.hypot(event.clientX - closestX, event.clientY - closestY);
}

function getFloatingMenuSurface(menuRef: RefObject<HTMLElement | null>): HTMLElement | null {
  const menu = menuRef.current;
  if (!menu) return null;
  return menu.matches('.sniptale-popover-menu')
    ? menu
    : menu.querySelector<HTMLElement>('.sniptale-popover-menu');
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

  const uiScale = readContentUiScaleCompensation(anchorEl);
  const clientRect = anchorEl.getBoundingClientRect();
  const anchorRect = projectClientRectToContentUi(
    { x: clientRect.left, y: clientRect.top, width: clientRect.width, height: clientRect.height },
    uiScale
  );
  const viewport = resolveContentUiViewport({
    clientHeight: window.innerHeight,
    clientWidth: window.innerWidth,
    scale: uiScale,
  });

  if (displayMode === 'vertical') {
    return resolveVerticalToolbarFloatingMenuStyle({
      anchorRect,
      menuHeight,
      menuWidth,
      viewportRightInset,
      viewport,
    });
  }

  return resolveHorizontalToolbarFloatingMenuStyle({
    anchorRect,
    menuWidth,
    placement,
    preferredAlign,
    viewportRightInset,
    viewport,
  });
}

function resolveHorizontalToolbarFloatingMenuStyle(args: {
  anchorRect: { x: number; y: number; width: number; height: number };
  menuWidth: number;
  placement: 'up' | 'down';
  preferredAlign: 'start' | 'end';
  viewportRightInset: number;
  viewport: { width: number; height: number };
}): CSSProperties {
  const minLeft = TOOLBAR_MENU_VIEWPORT_MARGIN_PX - args.anchorRect.x;
  const maxLeft =
    args.viewport.width -
    args.viewportRightInset -
    TOOLBAR_MENU_VIEWPORT_MARGIN_PX -
    args.anchorRect.x -
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
  anchorRect: { x: number; y: number; width: number; height: number };
  menuHeight: number;
  menuWidth: number;
  viewportRightInset: number;
  viewport: { width: number; height: number };
}): CSSProperties {
  const spaceRight =
    args.viewport.width -
    args.viewportRightInset -
    (args.anchorRect.x + args.anchorRect.width) -
    TOOLBAR_MENU_VIEWPORT_MARGIN_PX;
  const spaceLeft = args.anchorRect.x - TOOLBAR_MENU_VIEWPORT_MARGIN_PX;
  const top = resolveVerticalToolbarFloatingMenuTop(
    args.anchorRect,
    args.menuHeight,
    args.viewport.height
  );

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

function resolveVerticalToolbarFloatingMenuTop(
  anchorRect: { y: number },
  menuHeight: number,
  viewportHeight: number
): number {
  const minTop = TOOLBAR_MENU_VIEWPORT_MARGIN_PX - anchorRect.y;
  const maxTop = viewportHeight - TOOLBAR_MENU_VIEWPORT_MARGIN_PX - anchorRect.y - menuHeight;

  return clampValue(0, minTop, maxTop);
}

function bindToolbarFloatingMenuDismissalHandlers(handlers: {
  handleFocusIn: (event: FocusEvent) => void;
  handlePointerDown: (event: PointerEvent) => void;
  handlePointerMove?: ((event: MouseEvent) => void) | undefined;
  handleViewportChange: () => void;
}): () => void {
  document.addEventListener('pointerdown', handlers.handlePointerDown, true);
  if (handlers.handlePointerMove) {
    document.addEventListener('mousemove', handlers.handlePointerMove);
  }
  document.addEventListener('focusin', handlers.handleFocusIn, true);
  window.addEventListener('resize', handlers.handleViewportChange);
  window.addEventListener('scroll', handlers.handleViewportChange, true);

  return () => {
    document.removeEventListener('pointerdown', handlers.handlePointerDown, true);
    if (handlers.handlePointerMove) {
      document.removeEventListener('mousemove', handlers.handlePointerMove);
    }
    document.removeEventListener('focusin', handlers.handleFocusIn, true);
    window.removeEventListener('resize', handlers.handleViewportChange);
    window.removeEventListener('scroll', handlers.handleViewportChange, true);
  };
}

export function useToolbarFloatingMenuDismissal(params: {
  closeOnFarPointer?: boolean;
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  menuRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onFarPointerClose?: (() => void) | undefined;
}) {
  const {
    closeOnFarPointer = false,
    open,
    triggerRef,
    menuRef,
    onClose,
    onFarPointerClose,
  } = params;

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

    const handleViewportChange = () => {
      onClose();
    };

    const handlePointerMove = closeOnFarPointer
      ? (event: MouseEvent) => {
          if (isMenuEventWithinRefs(event, refs)) return;
          const surface = getFloatingMenuSurface(menuRef);
          if (
            surface &&
            getPointerDistanceFromRect(event, surface.getBoundingClientRect()) >
              TOOLBAR_MENU_POINTER_DISMISS_DISTANCE_PX * readContentUiScaleCompensation(surface)
          ) {
            (onFarPointerClose ?? onClose)();
          }
        }
      : undefined;

    const unregisterEscapeOwner = registerToolbarMenuEscapeOwner(onClose);
    const unbindHandlers = bindToolbarFloatingMenuDismissalHandlers({
      handleFocusIn,
      handlePointerDown,
      handlePointerMove,
      handleViewportChange,
    });
    return () => {
      unregisterEscapeOwner();
      unbindHandlers();
    };
  }, [closeOnFarPointer, menuRef, onClose, onFarPointerClose, open, triggerRef]);
}
