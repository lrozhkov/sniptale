import type { CSSProperties } from 'react';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';

/** Geometry follows the trigger and rendered warning size independently of confirmation state. */
export function bindDeletionMenuPosition(
  surface: HTMLElement,
  anchor: HTMLElement | null,
  onPosition: (style: CSSProperties) => void
) {
  const updatePosition = () => {
    const rect = anchor?.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 24);
    const height = surface.getBoundingClientRect().height;
    const left = Math.max(12, Math.min(rect?.left ?? 12, window.innerWidth - width - 12));
    const below = rect?.bottom ?? 12;
    const top =
      below + height + 6 <= window.innerHeight - 12
        ? below + 6
        : Math.max(12, (rect?.top ?? window.innerHeight - 12) - height - 6);
    onPosition({
      position: 'fixed',
      width,
      left,
      top,
      zIndex: 2147483647,
      maxHeight: window.innerHeight - 24,
      overflowY: 'auto',
    });
  };
  const unbind = bindFloatingInteractionPositionListeners(anchor, updatePosition);
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition);
  resize?.observe(surface);
  return () => {
    resize?.disconnect();
    unbind?.();
  };
}
