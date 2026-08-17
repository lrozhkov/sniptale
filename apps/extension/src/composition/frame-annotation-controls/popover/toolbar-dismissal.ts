import type { RefObject } from 'react';

import { usePopoverDistanceClose, usePopoverEscapeClose, usePopoverOutsideClose } from './hooks';

export function useToolbarSettingsPopoverDismissal(args: {
  anchorEl: HTMLElement | null;
  enabled: boolean;
  onClose: () => void;
  popoverRef: RefObject<HTMLDivElement | null>;
}) {
  const isAnchorEvent = (event: Event) => isEventWithinElement(event, args.anchorEl);
  usePopoverOutsideClose({
    isOpen: args.enabled,
    onClose: args.onClose,
    popoverRef: args.popoverRef,
    shouldIgnoreOutsideEvent: isAnchorEvent,
  });
  usePopoverEscapeClose({
    anchorEl: args.anchorEl,
    isOpen: args.enabled,
    onClose: args.onClose,
  });
  usePopoverDistanceClose({
    isOpen: args.enabled,
    onClose: args.onClose,
    popoverRef: args.popoverRef,
    shouldIgnoreEvent: isAnchorEvent,
  });
}

function isEventWithinElement(event: Event, element: Element | null): boolean {
  if (!element) return false;
  return (
    event.composedPath().includes(element) ||
    (event.target instanceof Node && element.contains(event.target))
  );
}
