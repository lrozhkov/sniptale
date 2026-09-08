import type { CSSProperties, RefObject } from 'react';
import { useCallback, useLayoutEffect, useState } from 'react';

interface GlassSelectLayoutOptions {
  portal: boolean;
  isOpen: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  placement?: 'auto' | 'bottom';
  menuWidth?: number;
}

function getNextMenuPosition(
  containerRect: DOMRect,
  menuHeight: number,
  placement: 'auto' | 'bottom'
) {
  if (placement === 'bottom') {
    return 'bottom';
  }
  const spaceBelow = window.innerHeight - containerRect.bottom;
  const spaceAbove = containerRect.top;
  return spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';
}

function useGlassSelectWindowListeners(
  isOpen: boolean,
  updateMenuLayout: () => void,
  observedMenu: RefObject<HTMLDivElement | null>,
  observedContainer: RefObject<HTMLDivElement | null>,
  observeSize: boolean
) {
  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updateMenuLayout();

    const handleWindowChange = () => updateMenuLayout();
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
    const observer =
      observeSize && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateMenuLayout)
        : null;
    if (observedMenu.current) observer?.observe(observedMenu.current);
    if (observedContainer.current) observer?.observe(observedContainer.current);

    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
      observer?.disconnect();
    };
  }, [isOpen, updateMenuLayout, observedMenu, observedContainer, observeSize]);
}

export function useGlassSelectLayout({
  portal,
  isOpen,
  containerRef,
  menuRef,
  placement = 'auto',
  menuWidth,
}: GlassSelectLayoutOptions) {
  const preferredWidth =
    menuWidth !== undefined && Number.isFinite(menuWidth) && menuWidth > 0 ? menuWidth : undefined;
  const [menuPosition, setMenuPosition] = useState<'bottom' | 'top'>('bottom');
  const [portalStyle, setPortalStyle] = useState<CSSProperties>({});

  const updatePortalStyle = useCallback(
    (containerRect: DOMRect, menuHeight: number, nextPosition: 'bottom' | 'top') => {
      if (!portal) {
        return;
      }

      const width =
        preferredWidth === undefined
          ? containerRect.width
          : Math.min(preferredWidth, Math.max(0, window.innerWidth - 16));
      setPortalStyle({
        position: 'fixed',
        left:
          preferredWidth === undefined
            ? containerRect.left
            : Math.max(8, Math.min(containerRect.left, window.innerWidth - width - 8)),
        top:
          placement === 'bottom'
            ? containerRect.bottom + 8
            : nextPosition === 'top'
              ? Math.max(8, containerRect.top - menuHeight - 8)
              : Math.min(window.innerHeight - menuHeight - 8, containerRect.bottom + 8),
        width,
        zIndex: 80,
      });
    },
    [placement, portal, preferredWidth]
  );

  const updateMenuLayout = useCallback(() => {
    if (!containerRef.current || !menuRef.current) {
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current.offsetHeight || 200;
    const nextPosition = getNextMenuPosition(containerRect, menuHeight, placement);

    setMenuPosition(nextPosition);
    updatePortalStyle(containerRect, menuHeight, nextPosition);
  }, [containerRef, menuRef, placement, updatePortalStyle]);

  useGlassSelectWindowListeners(
    isOpen,
    updateMenuLayout,
    menuRef,
    containerRef,
    portal && preferredWidth !== undefined
  );

  return {
    menuPosition,
    portalStyle,
  };
}
