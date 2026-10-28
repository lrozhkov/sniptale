import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import { readContentUiScaleCompensation } from '@sniptale/ui/floating-interactions/scale';

type SetIsOpen = Dispatch<SetStateAction<boolean>>;
type SetSearchQuery = Dispatch<SetStateAction<string>>;
type EventWithinElementResolver = (event: MouseEvent, element: Element | null) => boolean;

function isDefaultEventWithinElement(event: MouseEvent, element: Element | null): boolean {
  return event.target instanceof Node ? Boolean(element?.contains(event.target)) : false;
}

export function useAIModelSelectorDismissState(args: {
  dropdownRef: RefObject<HTMLDivElement | null>;
  menuRef?: RefObject<HTMLDivElement | null>;
  isEventWithinElement?: EventWithinElementResolver;
  isOpen: boolean;
  setIsOpen: SetIsOpen;
  setSearchQuery: SetSearchQuery;
}) {
  const {
    dropdownRef,
    menuRef,
    isEventWithinElement = isDefaultEventWithinElement,
    isOpen,
    setIsOpen,
    setSearchQuery,
  } = args;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (
        !isEventWithinElement(event, dropdownRef.current) &&
        !(menuRef?.current && isEventWithinElement(event, menuRef.current))
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [dropdownRef, menuRef, isEventWithinElement, isOpen, setIsOpen, setSearchQuery]);
}

export function useAIModelSelectorSearchFocus(
  isOpen: boolean,
  searchInputRef: RefObject<HTMLInputElement | null>
) {
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchInputRef]);
}

function modelMenuStyle(anchor: HTMLDivElement, portalMenu: boolean): CSSProperties | null {
  const ownerWindow = anchor.ownerDocument.defaultView!;
  const bounds = {
    left: 0,
    top: 0,
    right: ownerWindow.innerWidth,
    bottom: ownerWindow.innerHeight,
  };
  let ancestor: HTMLElement | null = anchor.parentElement;
  while (ancestor) {
    const style = ownerWindow.getComputedStyle(ancestor);
    const rect = ancestor.getBoundingClientRect();
    // Root overflow applies to the viewport, not the document's content-height rectangle.
    const isDocumentRoot =
      ancestor === anchor.ownerDocument.body || ancestor === anchor.ownerDocument.documentElement;
    if (!isDocumentRoot && /(auto|scroll|hidden|clip)/u.test(style.overflowX)) {
      bounds.left = Math.max(bounds.left, rect.left);
      bounds.right = Math.min(bounds.right, rect.right);
    }
    if (!isDocumentRoot && /(auto|scroll|hidden|clip)/u.test(style.overflowY)) {
      bounds.top = Math.max(bounds.top, rect.top);
      bounds.bottom = Math.min(bounds.bottom, rect.bottom);
    }
    const root = ancestor.getRootNode();
    ancestor =
      ancestor.parentElement ??
      (root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : null);
  }
  const rect = anchor.getBoundingClientRect();
  if (
    rect.bottom <= bounds.top ||
    rect.top >= bounds.bottom ||
    rect.right <= bounds.left ||
    rect.left >= bounds.right
  ) {
    return null;
  }
  if (portalMenu) {
    bounds.left = 0;
    bounds.top = 0;
    bounds.right = ownerWindow.innerWidth;
    bounds.bottom = ownerWindow.innerHeight;
  }
  const scale = portalMenu ? 1 : readContentUiScaleCompensation(anchor);
  const gap = 4 * scale;
  const above = Math.max(0, rect.top - bounds.top - gap - 8);
  const below = Math.max(0, bounds.bottom - rect.bottom - gap - 8);
  const width = Math.min(
    480,
    Math.max(256, rect.width / scale),
    Math.max(0, bounds.right - bounds.left - 16) / scale
  );
  const left = Math.max(bounds.left + 8, Math.min(rect.left, bounds.right - width * scale - 8));
  const up = above >= below;
  if (portalMenu) {
    const maxHeight = Math.min(320, up ? above : below);
    return {
      position: 'fixed',
      left,
      top: up ? 'auto' : rect.bottom + gap,
      bottom: up ? ownerWindow.innerHeight - rect.top + gap : 'auto',
      width,
      maxHeight,
    };
  }
  return {
    left: (left - rect.left) / scale,
    right: 'auto',
    top: up ? 'auto' : 'calc(100% + 4px)',
    bottom: up ? 'calc(100% + 4px)' : 'auto',
    width,
    maxHeight: Math.min(320, (up ? above : below) / scale),
  };
}

export function useAIModelSelectorMenuLayout(
  isOpen: boolean,
  anchorRef: RefObject<HTMLDivElement | null>,
  setIsOpen: SetIsOpen,
  setSearchQuery: SetSearchQuery,
  portalMenu = false
) {
  const [style, setStyle] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!isOpen || !anchor) return;
    const update = () => {
      const nextStyle = modelMenuStyle(anchor, portalMenu);
      if (nextStyle) {
        setStyle(nextStyle);
      } else {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    const unbind = bindFloatingInteractionPositionListeners(anchor, update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(anchor);
    return () => {
      unbind?.();
      observer?.disconnect();
    };
  }, [isOpen, anchorRef, setIsOpen, setSearchQuery, portalMenu]);
  return style;
}
