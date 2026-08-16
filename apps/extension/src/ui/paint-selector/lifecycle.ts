import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { getOwnedFloatingInteractionLayers } from '@sniptale/ui/floating-interactions/ownership';
import { isEyedropperSessionActive } from '@sniptale/ui/color-selector/popover-state';

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

function isEventWithin(event: Event, element: HTMLElement | null): boolean {
  if (!element) return false;
  return event
    .composedPath()
    .some((target) => target === element || (target instanceof Node && element.contains(target)));
}

function isEventWithinOwnedLayer(event: Event, ownerScope: HTMLElement | null): boolean {
  return getOwnedLayers(ownerScope).some((layer) => isEventWithin(event, layer));
}

function getOwnedLayers(ownerScope: HTMLElement | null): HTMLElement[] {
  if (!ownerScope) return [];
  const composedRoot = ownerScope.getRootNode();
  if (!(composedRoot instanceof Document || composedRoot instanceof ShadowRoot)) return [];
  return getOwnedFloatingInteractionLayers(ownerScope, composedRoot);
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
  eyedropperActiveRef: RefObject<boolean>;
  layerRef: RefObject<HTMLDivElement | null>;
  onOpenChange: ((open: boolean) => void) | undefined;
  open: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const {
    cancel,
    disabled,
    eyedropperActiveRef,
    layerRef,
    onOpenChange,
    open,
    rootRef,
    triggerRef,
  } = options;
  const wasOpenRef = useRef(false);
  useEffect(() => onOpenChange?.(open), [onOpenChange, open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (
        eyedropperActiveRef.current ||
        isEyedropperSessionActive() ||
        isEventWithin(event, rootRef.current) ||
        isEventWithin(event, layerRef.current) ||
        isEventWithinOwnedLayer(event, layerRef.current)
      )
        return;
      cancel();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (getOwnedLayers(layerRef.current).length > 0) return;
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
      const activeIndex = active instanceof HTMLElement ? focusable.indexOf(active) : -1;
      if (activeIndex < 0) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
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
  }, [cancel, eyedropperActiveRef, layerRef, open, rootRef]);
  useEffect(() => {
    if (disabled && open) cancel();
  }, [cancel, disabled, open]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      layerRef.current
        ?.querySelector<HTMLElement>('[role="dialog"]')
        ?.focus({ preventScroll: true });
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
