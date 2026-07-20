import type { CSSProperties, RefObject } from 'react';
import { useCallback, useLayoutEffect, useState } from 'react';

interface GlassSelectLayoutOptions {
  portal: boolean;
  isOpen: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
}

function getNextMenuPosition(containerRect: DOMRect, menuHeight: number) {
  const spaceBelow = window.innerHeight - containerRect.bottom;
  const spaceAbove = containerRect.top;
  return spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';
}

function useGlassSelectWindowListeners(isOpen: boolean, updateMenuLayout: () => void) {
  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updateMenuLayout();

    const handleWindowChange = () => updateMenuLayout();
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [isOpen, updateMenuLayout]);
}

export function useGlassSelectLayout({
  portal,
  isOpen,
  containerRef,
  menuRef,
}: GlassSelectLayoutOptions) {
  const [menuPosition, setMenuPosition] = useState<'bottom' | 'top'>('bottom');
  const [portalStyle, setPortalStyle] = useState<CSSProperties>({});

  const updatePortalStyle = useCallback(
    (containerRect: DOMRect, menuHeight: number, nextPosition: 'bottom' | 'top') => {
      if (!portal) {
        return;
      }

      setPortalStyle({
        position: 'fixed',
        left: containerRect.left,
        top:
          nextPosition === 'top'
            ? Math.max(8, containerRect.top - menuHeight - 8)
            : Math.min(window.innerHeight - menuHeight - 8, containerRect.bottom + 8),
        width: containerRect.width,
        zIndex: 80,
      });
    },
    [portal]
  );

  const updateMenuLayout = useCallback(() => {
    if (!containerRef.current || !menuRef.current) {
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current.offsetHeight || 200;
    const nextPosition = getNextMenuPosition(containerRect, menuHeight);

    setMenuPosition(nextPosition);
    updatePortalStyle(containerRect, menuHeight, nextPosition);
  }, [containerRef, menuRef, updatePortalStyle]);

  useGlassSelectWindowListeners(isOpen, updateMenuLayout);

  return {
    menuPosition,
    portalStyle,
  };
}
