import { useCallback } from 'react';
import type { CSSProperties } from 'react';
import { POPOVER_HEIGHT, POPOVER_WIDTH } from './helpers';

export function useStepBadgePopoverLayout(anchorEl: HTMLElement | null) {
  return useCallback((): CSSProperties => {
    if (!anchorEl) {
      return {
        position: 'fixed',
        top: 0,
        left: 0,
        visibility: 'hidden',
        pointerEvents: 'none',
      };
    }

    const rect = anchorEl.getBoundingClientRect();
    const margin = 8;
    let top = rect.bottom + margin;
    let left = rect.left;

    if (top + POPOVER_HEIGHT > window.innerHeight) {
      top = rect.top - POPOVER_HEIGHT - margin;
    }
    if (left + POPOVER_WIDTH > window.innerWidth) {
      left = window.innerWidth - POPOVER_WIDTH - margin;
    }

    return {
      position: 'fixed',
      top: Math.max(margin, top),
      left: Math.max(margin, left),
      zIndex: 2147483647,
      pointerEvents: 'auto',
    };
  }, [anchorEl]);
}
