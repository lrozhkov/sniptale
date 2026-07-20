import type { RefObject } from 'react';
import { useGlassSelectDismiss } from './dismiss';
import { useGlassSelectLayout } from './layout';

interface GlassSelectOverlayOptions {
  portal: boolean;
  isOpen: boolean;
  setIsOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
}

export function useGlassSelectOverlay({
  portal,
  isOpen,
  setIsOpen,
  containerRef,
  menuRef,
}: GlassSelectOverlayOptions) {
  useGlassSelectDismiss({
    isOpen,
    setIsOpen: (value) => setIsOpen(value),
    containerRef,
    menuRef,
  });

  const { menuPosition, portalStyle } = useGlassSelectLayout({
    portal,
    isOpen,
    containerRef,
    menuRef,
  });

  return {
    menuPosition,
    portalStyle,
  };
}
