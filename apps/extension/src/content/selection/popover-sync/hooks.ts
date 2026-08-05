import { useEffect } from 'react';
import { isContentEventWithinAnyElement } from '../../platform/dom-host';
import { getOwnedFloatingInteractionLayers } from '@sniptale/ui/floating-interactions/ownership';

interface PopoverSyncHookProps {
  isOpen: boolean;
  listenerDelayMs?: number;
  onClose: () => void;
  popoverRef: React.RefObject<HTMLDivElement | null>;
}

interface PopoverOutsideCloseProps extends PopoverSyncHookProps {
  shouldIgnoreOutsideEvent?: (event: MouseEvent) => boolean;
}

interface PopoverDistanceCloseProps extends PopoverSyncHookProps {
  autoCloseDistance?: number;
  checkThrottleMs?: number;
  shouldIgnoreEvent?: (event: MouseEvent) => boolean;
}

function isPopoverInteraction(event: MouseEvent, popover: HTMLElement | null): boolean {
  if (!popover) return false;
  const ownedLayers = getOwnedFloatingInteractionLayers(
    popover,
    popover.getRootNode() as ParentNode
  );
  return isContentEventWithinAnyElement(event, [popover, ...ownedLayers]);
}

export function usePopoverEscapeClose(
  props: Pick<PopoverSyncHookProps, 'isOpen' | 'onClose'> & { anchorEl?: HTMLElement | null }
) {
  const { anchorEl, isOpen, onClose } = props;
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
      anchorEl?.focus();
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [anchorEl, isOpen, onClose]);
}

function getPointerDistanceFromElement(event: MouseEvent, element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const closestX = Math.max(rect.left, Math.min(event.clientX, rect.right));
  const closestY = Math.max(rect.top, Math.min(event.clientY, rect.bottom));
  const dx = event.clientX - closestX;
  const dy = event.clientY - closestY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function usePopoverOutsideClose(props: PopoverOutsideCloseProps) {
  const { isOpen, listenerDelayMs = 150, onClose, popoverRef, shouldIgnoreOutsideEvent } = props;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (shouldIgnoreOutsideEvent?.(event)) {
        return;
      }

      if (!isPopoverInteraction(event, popoverRef.current)) {
        onClose();
      }
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, listenerDelayMs);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, listenerDelayMs, onClose, popoverRef, shouldIgnoreOutsideEvent]);
}

export function usePopoverDistanceClose(props: PopoverDistanceCloseProps) {
  const {
    autoCloseDistance = 200,
    checkThrottleMs = 200,
    isOpen,
    listenerDelayMs = 300,
    onClose,
    popoverRef,
    shouldIgnoreEvent,
  } = props;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let lastCheckTime = 0;

    const handleMouseMove = (event: MouseEvent) => {
      if (shouldIgnoreEvent?.(event) || isPopoverInteraction(event, popoverRef.current)) {
        return;
      }
      const now = Date.now();
      if (now - lastCheckTime < checkThrottleMs) {
        return;
      }
      lastCheckTime = now;

      const popoverElement = popoverRef.current;
      if (!popoverElement) {
        return;
      }

      if (getPointerDistanceFromElement(event, popoverElement) > autoCloseDistance) {
        onClose();
      }
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('mousemove', handleMouseMove);
    }, listenerDelayMs);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [
    autoCloseDistance,
    checkThrottleMs,
    isOpen,
    listenerDelayMs,
    onClose,
    popoverRef,
    shouldIgnoreEvent,
  ]);
}
