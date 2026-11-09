import { useCallback, useEffect, type RefObject } from 'react';
import { isContentEventWithinElement, queryContentUiElement } from '../../../platform/dom-host';

const PANEL_TOGGLE_SELECTOR = '[data-ui="content.toolbar.design-review-panel-button"]';

function focusPanelToggle(): void {
  queueMicrotask(() => queryContentUiElement<HTMLButtonElement>(PANEL_TOGGLE_SELECTOR)?.focus());
}

export function useFeedbackPanelLifecycle(args: {
  filterOpen: boolean;
  filterRootRef: RefObject<HTMLDivElement | null>;
  filterTriggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  searchOpen: boolean;
  onSearchClose: () => void;
  onFilterOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { filterOpen, filterRootRef, filterTriggerRef, onClose, onFilterOpenChange, open } = args;
  const { searchOpen, onSearchClose } = args;
  const closePanel = useCallback(() => {
    onFilterOpenChange(false);
    onSearchClose();
    onClose();
    focusPanelToggle();
  }, [onClose, onFilterOpenChange, onSearchClose]);

  useEffect(() => {
    if (!open) {
      onFilterOpenChange(false);
      if (searchOpen) onSearchClose();
      return;
    }

    const closeFilter = (restoreFocus: boolean) => {
      onFilterOpenChange(false);
      if (restoreFocus) queueMicrotask(() => filterTriggerRef.current?.focus());
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (filterOpen && !isContentEventWithinElement(event, filterRootRef.current)) {
        closeFilter(false);
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (filterOpen && !isContentEventWithinElement(event, filterRootRef.current)) {
        closeFilter(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (filterOpen) {
        closeFilter(true);
      } else if (searchOpen) {
        onSearchClose();
      } else {
        closePanel();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusin', handleFocusIn, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    closePanel,
    filterOpen,
    filterRootRef,
    filterTriggerRef,
    onFilterOpenChange,
    onSearchClose,
    open,
    searchOpen,
  ]);

  return { closePanel };
}
