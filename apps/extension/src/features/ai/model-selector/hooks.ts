import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';

type SetIsOpen = Dispatch<SetStateAction<boolean>>;
type SetSearchQuery = Dispatch<SetStateAction<string>>;
type EventWithinElementResolver = (event: MouseEvent, element: Element | null) => boolean;

function isDefaultEventWithinElement(event: MouseEvent, element: Element | null): boolean {
  return event.target instanceof Node ? Boolean(element?.contains(event.target)) : false;
}

export function useAIModelSelectorDismissState(args: {
  dropdownRef: RefObject<HTMLDivElement | null>;
  isEventWithinElement?: EventWithinElementResolver;
  isOpen: boolean;
  setIsOpen: SetIsOpen;
  setSearchQuery: SetSearchQuery;
}) {
  const {
    dropdownRef,
    isEventWithinElement = isDefaultEventWithinElement,
    isOpen,
    setIsOpen,
    setSearchQuery,
  } = args;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (!isEventWithinElement(event, dropdownRef.current)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [dropdownRef, isEventWithinElement, isOpen, setIsOpen, setSearchQuery]);
}

export function useAIModelSelectorSearchFocus(
  isOpen: boolean,
  searchInputRef: RefObject<HTMLInputElement | null>
) {
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchInputRef]);
}
