import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true'
  );
}

export function useLibraryDrawerLifecycle(args: {
  isOpen: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
}): void {
  const { isOpen, onClose, panelRef } = args;
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusable = panel ? getFocusableElements(panel) : [];
    (focusable[0] ?? panel)?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const currentFocusable = getFocusableElements(panel);
      if (currentFocusable.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = currentFocusable[0];
      const last = currentFocusable.at(-1);
      if (event.shiftKey && first?.isSameNode(document.activeElement)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && last?.isSameNode(document.activeElement)) {
        event.preventDefault();
        first?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [isOpen, onClose, panelRef]);
}
