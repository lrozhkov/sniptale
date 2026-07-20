import { useCallback, useEffect, useRef, useState } from 'react';

const VIEWPORT_GAP_PX = 12;
const MIN_POPOVER_HEIGHT_PX = 168;
const DEFAULT_POPOVER_LAYOUT = { maxHeight: 384, top: 0 };

function resolvePopoverLayout(button: HTMLButtonElement, popover: HTMLDivElement | null) {
  const buttonRect = button.getBoundingClientRect();
  const viewportMaxHeight = Math.max(
    MIN_POPOVER_HEIGHT_PX,
    window.innerHeight - VIEWPORT_GAP_PX * 2
  );
  const measuredHeight = Math.min(popover?.scrollHeight ?? viewportMaxHeight, viewportMaxHeight);
  const overflowBottom = buttonRect.top + measuredHeight - (window.innerHeight - VIEWPORT_GAP_PX);
  const top = overflowBottom > 0 ? -Math.min(overflowBottom, buttonRect.top - VIEWPORT_GAP_PX) : 0;
  const viewportTop = Math.max(VIEWPORT_GAP_PX, buttonRect.top + top);
  const maxHeight = Math.max(
    MIN_POPOVER_HEIGHT_PX,
    window.innerHeight - viewportTop - VIEWPORT_GAP_PX
  );

  return { maxHeight, top };
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
    window.addEventListener('resize', updateLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateLayout);
    };
  }, [active, updateLayout]);

  return { buttonRef, layout, popoverRef };
}
