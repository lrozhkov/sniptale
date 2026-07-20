import type { RefObject } from 'react';
import { useEffect } from 'react';
import { isComposedEventWithinElement } from '../dom-events';

interface GlassSelectDismissOptions {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
}

export function useGlassSelectDismiss({
  isOpen,
  setIsOpen,
  containerRef,
  menuRef,
}: GlassSelectDismissOptions) {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isComposedEventWithinElement(event, containerRef.current) ||
        isComposedEventWithinElement(event, menuRef.current)
      ) {
        return;
      }

      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [containerRef, isOpen, menuRef, setIsOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, setIsOpen]);
}
