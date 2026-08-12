import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

function isEventWithin(event: Event, element: HTMLElement | null): boolean {
  if (!element) return false;
  return event
    .composedPath()
    .some((target) => target === element || (target instanceof Node && element.contains(target)));
}

function getLayerActiveElement(layer: HTMLElement): Element | null {
  const root = layer.getRootNode();
  if (root instanceof ShadowRoot) return root.activeElement;
  if (root instanceof Document) return root.activeElement;
  return layer.ownerDocument.activeElement;
}

export function usePaintSelectorLifecycle(options: {
  cancel: () => void;
  disabled: boolean | undefined;
  eyedropperActive: boolean;
  layerRef: RefObject<HTMLDivElement | null>;
  onOpenChange: ((open: boolean) => void) | undefined;
  open: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const { cancel, disabled, eyedropperActive, layerRef, onOpenChange, open, rootRef, triggerRef } =
    options;
  const wasOpenRef = useRef(false);
  useEffect(() => onOpenChange?.(open), [onOpenChange, open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (
        eyedropperActive ||
        isEventWithin(event, rootRef.current) ||
        isEventWithin(event, layerRef.current)
      )
        return;
      cancel();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const layer = layerRef.current;
      if (!layer) return;
      const focusable = Array.from(layer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const active = getLayerActiveElement(layer);
      if (event.shiftKey && (active === first || !layer.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !layer.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('mousedown', dismiss, true);
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.removeEventListener('mousedown', dismiss, true);
      document.removeEventListener('keydown', keyboard, true);
    };
  }, [cancel, eyedropperActive, layerRef, open, rootRef]);
  useEffect(() => {
    if (disabled && open) cancel();
  }, [cancel, disabled, open]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      layerRef.current?.querySelector<HTMLElement>('select, button, input')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [layerRef, open]);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!wasOpen || open) return;
    const frame = requestAnimationFrame(() => {
      if (!disabled && triggerRef.current?.isConnected) triggerRef.current.focus();
      else if (rootRef.current?.isConnected) rootRef.current.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [disabled, open, rootRef, triggerRef]);
}

export function resolvePaintSelectorLayerStyle(
  baseStyle: CSSProperties,
  anchor: HTMLElement | null,
  layout: 'solid' | 'gradient'
): CSSProperties {
  const preferredWidth = layout === 'solid' ? 328 : 600;
  const layerWidth =
    typeof window === 'undefined'
      ? preferredWidth
      : Math.min(preferredWidth, window.innerWidth - 16);
  const rect = anchor?.getBoundingClientRect();
  return {
    ...baseStyle,
    ...(rect && typeof window !== 'undefined'
      ? { left: Math.min(Math.max(8, rect.right - layerWidth), window.innerWidth - layerWidth - 8) }
      : {}),
    width: layerWidth,
    maxHeight: 'min(680px, calc(100vh - 16px))',
  };
}
