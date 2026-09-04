import { useCallback, useEffect, type RefObject } from 'react';
import { isContentEventWithinElement, queryContentUiElement } from '../../../platform/dom-host';

const PANEL_TOGGLE_SELECTOR = '[data-ui="content.toolbar.design-review-panel-button"]';
const ACTION_MENU_SELECTOR = '[data-ui="content.design-review.action-menu"]';

function focusPanelToggle(): void {
  queueMicrotask(() => queryContentUiElement<HTMLButtonElement>(PANEL_TOGGLE_SELECTOR)?.focus());
}

export function useFeedbackPanelLifecycle(args: {
  filterOpen: boolean;
  filterRootRef: RefObject<HTMLDivElement | null>;
  filterTriggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onFilterOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { filterOpen, filterRootRef, filterTriggerRef, onClose, onFilterOpenChange, open } = args;
  const closePanel = useCallback(() => {
    onFilterOpenChange(false);
    onClose();
    focusPanelToggle();
  }, [onClose, onFilterOpenChange]);

  useEffect(() => {
    if (!open) {
      onFilterOpenChange(false);
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
      if (queryContentUiElement(ACTION_MENU_SELECTOR)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (filterOpen) {
        closeFilter(true);
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
  }, [closePanel, filterOpen, filterRootRef, filterTriggerRef, onFilterOpenChange, open]);

  return { closePanel };
}
