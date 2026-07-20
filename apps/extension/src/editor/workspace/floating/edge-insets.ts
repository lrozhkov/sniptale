import { useLayoutEffect, useState } from 'react';
import type { CSSProperties } from 'react';

const CANVAS_VIEWPORT_SELECTOR = '[data-ui="editor.canvas.viewport"]';
const ZERO_EDGE_INSETS = { bottom: 0, right: 0 } as const;

interface FloatingWorkspaceEdgeInsets {
  bottom: number;
  right: number;
}

export function measureFloatingWorkspaceEdgeInsets(
  viewport: HTMLElement | null
): FloatingWorkspaceEdgeInsets {
  if (!viewport) {
    return ZERO_EDGE_INSETS;
  }

  return {
    bottom: Math.max(0, viewport.offsetHeight - viewport.clientHeight - viewport.clientTop),
    right: Math.max(0, viewport.offsetWidth - viewport.clientWidth - viewport.clientLeft),
  };
}

export function getFloatingWorkspaceEdgeInsetStyle(
  insets: FloatingWorkspaceEdgeInsets
): CSSProperties {
  return {
    '--editor-floating-edge-bottom': `${insets.bottom}px`,
    '--editor-floating-edge-right': `${insets.right}px`,
  } as CSSProperties;
}

export function useFloatingWorkspaceEdgeInsets(hasImage: boolean): FloatingWorkspaceEdgeInsets {
  const [insets, setInsets] = useState<FloatingWorkspaceEdgeInsets>(ZERO_EDGE_INSETS);

  useLayoutEffect(() => {
    if (!hasImage) {
      setInsets(ZERO_EDGE_INSETS);
      return undefined;
    }

    const viewport = document.querySelector<HTMLElement>(CANVAS_VIEWPORT_SELECTOR);
    if (!viewport) {
      setInsets(ZERO_EDGE_INSETS);
      return undefined;
    }

    const updateInsets = () => {
      const nextInsets = measureFloatingWorkspaceEdgeInsets(viewport);
      setInsets((currentInsets) =>
        currentInsets.bottom === nextInsets.bottom && currentInsets.right === nextInsets.right
          ? currentInsets
          : nextInsets
      );
    };
    updateInsets();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateInsets);
      return () => window.removeEventListener('resize', updateInsets);
    }

    const resizeObserver = new ResizeObserver(updateInsets);
    resizeObserver.observe(viewport);
    for (const child of Array.from(viewport.children)) {
      resizeObserver.observe(child);
    }
    window.addEventListener('resize', updateInsets);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateInsets);
    };
  }, [hasImage]);

  return insets;
}
