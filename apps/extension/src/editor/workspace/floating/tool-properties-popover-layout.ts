import { useCallback, useEffect, useRef, useState } from 'react';

const VIEWPORT_GAP_PX = 12;
const DEFAULT_POPOVER_LAYOUT = { left: 0, maxHeight: 384, top: 0 };

function resolvePopoverLayout(button: HTMLButtonElement, popover: HTMLDivElement | null) {
  const buttonRect = button.getBoundingClientRect();
  const toolbar = button.closest('.sniptale-toolbar-root')?.getBoundingClientRect() ?? buttonRect;
  const narrow = window.innerWidth < 720;
  const width = popover?.offsetWidth || 288;
  const height = Math.min(popover?.scrollHeight ?? 384, window.innerHeight - VIEWPORT_GAP_PX * 2);
  const preferredLeft = narrow ? toolbar.left : toolbar.right + VIEWPORT_GAP_PX;
  const left = Math.max(
    VIEWPORT_GAP_PX,
    preferredLeft + width <= window.innerWidth - VIEWPORT_GAP_PX
      ? preferredLeft
      : toolbar.left - width - VIEWPORT_GAP_PX
  );
  const top = narrow
    ? toolbar.bottom + VIEWPORT_GAP_PX
    : Math.max(
        VIEWPORT_GAP_PX,
        Math.min(buttonRect.top, window.innerHeight - height - VIEWPORT_GAP_PX)
      );

  return {
    left: left - buttonRect.left,
    top: top - buttonRect.top,
    maxHeight: Math.max(0, window.innerHeight - top - VIEWPORT_GAP_PX),
  };
}

export function useToolPropertiesPopoverLayout(active: boolean) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState(DEFAULT_POPOVER_LAYOUT);

  const updateLayout = useCallback(() => {
    const button = buttonRef.current;
    if (!active || !button) {
      setLayout(DEFAULT_POPOVER_LAYOUT);
      return;
    }

    setLayout(resolvePopoverLayout(button, popoverRef.current));
  }, [active]);

  useEffect(() => {
    updateLayout();
  }, [updateLayout]);

  useEffect(() => {
    const popover = popoverRef.current;
    if (!active || !popover || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => updateLayout());
    observer.observe(popover);
    const toolbar = buttonRef.current?.closest('.sniptale-toolbar-root');
    if (toolbar) observer.observe(toolbar);
    window.addEventListener('resize', updateLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateLayout);
    };
  }, [active, updateLayout]);

  return { buttonRef, layout, popoverRef };
}
