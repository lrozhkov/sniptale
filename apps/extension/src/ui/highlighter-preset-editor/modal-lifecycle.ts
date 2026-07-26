import { useLayoutEffect, useRef, type RefObject } from 'react';
import { getOwnedFloatingInteractionLayers } from '@sniptale/ui/floating-interactions/ownership';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(elements: readonly HTMLElement[]): HTMLElement[] {
  return elements
    .flatMap((element) => [...element.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)])
    .filter((element) => element.getAttribute('aria-hidden') !== 'true');
}

function getInitialFocusTarget(dialog: HTMLElement): HTMLElement {
  return (
    dialog.querySelector<HTMLElement>(
      'input:not([disabled]):not([type="hidden"]), textarea:not([disabled])'
    ) ??
    getFocusableElements([dialog])[0] ??
    dialog
  );
}

function resolveFocusRoot(dialog: HTMLElement): Document | ShadowRoot {
  const root = dialog.getRootNode();
  return typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot
    ? root
    : dialog.ownerDocument;
}

export function usePresetEditorModalLifecycle(args: {
  modalRootRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const onCloseRef = useRef(args.onClose);
  onCloseRef.current = args.onClose;

  useLayoutEffect(() => {
    const dialog = args.modalRootRef.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;

    const focusRoot = resolveFocusRoot(dialog);
    const previouslyFocused =
      focusRoot.activeElement instanceof HTMLElement ? focusRoot.activeElement : null;
    const previousTabIndex = dialog.getAttribute('tabindex');
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    getInitialFocusTarget(dialog).focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (getOwnedFloatingInteractionLayers(dialog, focusRoot).length > 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const ownedLayers = getOwnedFloatingInteractionLayers(dialog, focusRoot);
      const focusable = getFocusableElements([dialog, ...ownedLayers]);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const activeElement = focusRoot.activeElement;
      const currentIndex =
        activeElement instanceof HTMLElement ? focusable.indexOf(activeElement) : -1;
      const step = event.shiftKey ? -1 : 1;
      const nextIndex =
        currentIndex < 0
          ? event.shiftKey
            ? focusable.length - 1
            : 0
          : (currentIndex + step + focusable.length) % focusable.length;
      event.preventDefault();
      focusable[nextIndex]!.focus({ preventScroll: true });
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      dialog.removeAttribute('aria-modal');
      if (previousTabIndex === null) dialog.removeAttribute('tabindex');
      else dialog.setAttribute('tabindex', previousTabIndex);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [args.modalRootRef]);
}
