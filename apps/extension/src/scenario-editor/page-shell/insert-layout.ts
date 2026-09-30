import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';

/** Replaces the insertion anchor on its line, within its visible scroll and viewport bounds. */
export function useGuideInsertLayout({
  open,
  anchorRef,
  menuRef,
  width,
  close,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  width: number;
  close: (value: boolean) => void;
}) {
  const [style, setStyle] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth);
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight);
      const height = menuRect.height || 32;
      const actualWidth = Math.min(width, rightEdge - leftEdge - 16);
      const top = rect.top + (rect.height - height) / 2;
      let clipTop = topEdge;
      let clipBottom = bottomEdge;
      for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
        if (!/(auto|scroll|hidden|clip)/u.test(getComputedStyle(parent).overflowY)) continue;
        const bounds = parent.getBoundingClientRect();
        if (bounds.height === 0) continue;
        clipTop = Math.max(clipTop, bounds.top);
        clipBottom = Math.min(clipBottom, bounds.bottom);
      }
      if (top < clipTop || top + height > clipBottom) {
        close(false);
        return;
      }
      menu.dataset['tooltipBelow'] = String(top - topEdge < 56);
      setStyle({
        position: 'fixed',
        left: Math.max(
          leftEdge + 8,
          Math.min(rect.left + (rect.width - actualWidth) / 2, rightEdge - actualWidth - 8)
        ),
        top,
        width: actualWidth,
        zIndex: 100,
      });
    };
    const unbind = bindFloatingInteractionPositionListeners(anchor, update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(anchor);
    observer?.observe(menu);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      unbind?.();
      observer?.disconnect();
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [open, anchorRef, menuRef, width, close]);
  return style;
}
