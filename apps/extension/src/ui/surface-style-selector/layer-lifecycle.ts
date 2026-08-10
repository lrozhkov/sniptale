import { useLayoutEffect, useRef, type RefObject } from 'react';
import { isComposedEventWithinAnyElement } from '@sniptale/ui/dom-events';
import { getOwnedFloatingInteractionLayers } from '@sniptale/ui/floating-interactions/ownership';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function resolveFocusRoot(element: HTMLElement): Document | ShadowRoot {
  const root = element.getRootNode();
  return typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot
    ? root
    : element.ownerDocument;
}

function getLayerElements(root: HTMLElement, focusRoot: Document | ShadowRoot) {
  const dialog = root.querySelector<HTMLElement>('[role="dialog"]');
  const owned = getOwnedFloatingInteractionLayers(root, focusRoot);
  return { dialog, owned };
}

function getFocusable(elements: readonly HTMLElement[]) {
  return elements
    .flatMap((element) => [...element.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)])
    .filter((element) => element.getAttribute('aria-hidden') !== 'true');
}

export function useSurfaceStyleLayerLifecycle(args: {
  onDismiss: () => void;
  onLifecycleClosed: () => void;
  open: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const onDismissRef = useRef(args.onDismiss);
  const onLifecycleClosedRef = useRef(args.onLifecycleClosed);
  onDismissRef.current = args.onDismiss;
  onLifecycleClosedRef.current = args.onLifecycleClosed;

  useLayoutEffect(() => {
    const root = args.rootRef.current;
    if (!args.open || !root) return;
    const focusRoot = resolveFocusRoot(root);
    const eventTarget = root.ownerDocument;
    const { dialog } = getLayerElements(root, focusRoot);
    if (!dialog) return;
    const previouslyFocused =
      focusRoot.activeElement instanceof HTMLElement ? focusRoot.activeElement : null;
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    dialog.focus({ preventScroll: true });

    const handleMouseDown = (event: MouseEvent) => {
      const { owned } = getLayerElements(root, focusRoot);
      if (!isComposedEventWithinAnyElement(event, [root, ...owned])) onDismissRef.current();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const { owned } = getLayerElements(root, focusRoot);
      if (event.key === 'Escape') {
        if (owned.length > 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        onDismissRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable([dialog, ...owned]);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const currentIndex =
        focusRoot.activeElement instanceof HTMLElement
          ? focusable.indexOf(focusRoot.activeElement)
          : -1;
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
    eventTarget.addEventListener('mousedown', handleMouseDown, true);
    eventTarget.addEventListener('keydown', handleKeyDown, true);
    return () => {
      eventTarget.removeEventListener('mousedown', handleMouseDown, true);
      eventTarget.removeEventListener('keydown', handleKeyDown, true);
      dialog.removeAttribute('aria-modal');
      dialog.removeAttribute('tabindex');
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
      onLifecycleClosedRef.current();
    };
  }, [args.open, args.rootRef]);
}
