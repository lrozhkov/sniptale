import type React from 'react';

export function updateCompactPopoverLayout(
  commandId: string,
  collapsedCommandButtonRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>,
  collapsedPopoverRef: React.RefObject<HTMLDivElement | null>,
  setCollapsedPopoverStyle: React.Dispatch<React.SetStateAction<React.CSSProperties>>
) {
  const trigger = collapsedCommandButtonRefs.current[commandId];
  if (!trigger || !collapsedPopoverRef.current) {
    return;
  }

  const rect = trigger.getBoundingClientRect();
  const width = 336;
  const height = collapsedPopoverRef.current.offsetHeight || 280;
  const maxLeft = window.innerWidth - width - 12;
  const maxTop = window.innerHeight - height - 12;

  setCollapsedPopoverStyle({
    position: 'fixed',
    left: Math.max(12, Math.min(rect.right + 12, maxLeft)),
    top: Math.max(12, Math.min(rect.top, maxTop)),
    width,
    zIndex: 90,
  });
}

export function shouldKeepCompactPopoverOpen(
  event: MouseEvent,
  commandId: string,
  collapsedCommandButtonRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>,
  collapsedPopoverRef: React.RefObject<HTMLDivElement | null>
) {
  const target = event.target;
  const node = target instanceof Node ? target : null;
  const element = target instanceof Element ? target : (node?.parentElement ?? null);

  if (element?.closest('[data-floating-ui-root="true"]')) {
    return true;
  }

  const trigger = collapsedCommandButtonRefs.current[commandId];
  return Boolean(node && (trigger?.contains(node) || collapsedPopoverRef.current?.contains(node)));
}
