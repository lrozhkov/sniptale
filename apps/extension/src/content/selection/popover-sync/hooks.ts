import { useEffect } from 'react';
import { isContentEventWithinElement } from '../../platform/dom-host';

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

      if (!isContentEventWithinElement(event, popoverRef.current)) {
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
  } = props;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let lastCheckTime = 0;

    const handleMouseMove = (event: MouseEvent) => {
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
  }, [autoCloseDistance, checkThrottleMs, isOpen, listenerDelayMs, onClose, popoverRef]);
}
