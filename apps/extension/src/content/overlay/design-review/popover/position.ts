import { useLayoutEffect, useState, type RefObject } from 'react';
import { getAbsolutePosition } from '../../../platform/frame';
import { resolveContentUiViewport } from '@sniptale/ui/floating-interactions/scale';

const POPOVER_WIDTH = 480;
export const DESIGN_REVIEW_POPOVER_VIEWPORT_GAP = 12;

interface PopoverMetrics {
  height: number;
  viewportHeight: number;
  viewportWidth: number;
}

interface PopoverTargetRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function resolveDesignReviewPopoverPosition(
  anchor: { x: number; y: number },
  targetRect: PopoverTargetRect | null,
  expanded: boolean,
  metrics: PopoverMetrics | null
) {
  const gap = DESIGN_REVIEW_POPOVER_VIEWPORT_GAP;
  const viewportWidth = metrics?.viewportWidth ?? window.innerWidth;
  const viewportHeight = metrics?.viewportHeight ?? window.innerHeight;
  const maxHeight = Math.max(0, viewportHeight - gap * 2);
  const width = Math.min(POPOVER_WIDTH, Math.max(0, viewportWidth - gap * 2));
  const measuredHeight = metrics?.height ?? (expanded ? 620 : 310);
  const height = Math.min(measuredHeight, maxHeight);
  const cursorLeft =
    anchor.x + gap + width <= viewportWidth - gap ? anchor.x + gap : anchor.x - width - gap;
  const cursorTop =
    anchor.y + gap + height <= viewportHeight - gap ? anchor.y + gap : anchor.y - height - gap;
  let preferredLeft = cursorLeft;
  let preferredTop = cursorTop;
  if (targetRect) {
    if (targetRect.right + gap + width <= viewportWidth - gap) {
      preferredLeft = targetRect.right + gap;
      preferredTop = targetRect.top;
    } else if (targetRect.left - gap - width >= gap) {
      preferredLeft = targetRect.left - gap - width;
      preferredTop = targetRect.top;
    } else if (targetRect.bottom + gap + height <= viewportHeight - gap) {
      preferredLeft = anchor.x;
      preferredTop = targetRect.bottom + gap;
    } else if (targetRect.top - gap - height >= gap) {
      preferredLeft = anchor.x;
      preferredTop = targetRect.top - gap - height;
    }
  }
  return {
    left: clamp(preferredLeft, gap, viewportWidth - width - gap),
    maxHeight,
    top: clamp(preferredTop, gap, viewportHeight - height - gap),
    width,
  };
}

export function readDesignReviewPopoverTargetRect(
  element: Element | null,
  uiScale = 1
): PopoverTargetRect | null {
  if (!element) return null;
  try {
    const position = getAbsolutePosition(element);
    return position.width > 0 || position.height > 0
      ? {
          bottom: (position.y + position.height) / uiScale,
          left: position.x / uiScale,
          right: (position.x + position.width) / uiScale,
          top: position.y / uiScale,
        }
      : null;
  } catch {
    return null;
  }
}

export function useDesignReviewPopoverMetrics(args: {
  active: boolean;
  elementRef: RefObject<HTMLElement | null>;
  measurementKey: string;
  uiScale?: number;
}): PopoverMetrics | null {
  const [metrics, setMetrics] = useState<PopoverMetrics | null>(null);

  useLayoutEffect(() => {
    const element = args.elementRef.current;
    if (!args.active || !element) {
      setMetrics(null);
      return;
    }

    const measure = () => {
      const rect = element.getBoundingClientRect();
      const uiScale = args.uiScale ?? 1;
      const viewport = resolveContentUiViewport({
        clientHeight: window.innerHeight,
        clientWidth: window.innerWidth,
        scale: uiScale,
      });
      const next = {
        height: rect.height / uiScale,
        viewportHeight: viewport.height,
        viewportWidth: viewport.width,
      };
      setMetrics((current) =>
        current?.height === next.height &&
        current.viewportHeight === next.viewportHeight &&
        current.viewportWidth === next.viewportWidth
          ? current
          : next
      );
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [args.active, args.elementRef, args.measurementKey, args.uiScale]);

  return metrics;
}
