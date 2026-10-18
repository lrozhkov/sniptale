import { isComposedEventWithinElement } from '../dom-events';
import { createContext, useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';

/** Enables the native command press cycle for a migrated surface and its portals. */
export const CommandPressScope = createContext(false);

type ButtonHandlers = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | 'onPointerDown'
  | 'onPointerEnter'
  | 'onPointerLeave'
  | 'onPointerCancel'
  | 'onLostPointerCapture'
  | 'onKeyDown'
  | 'onKeyUp'
  | 'onBlur'
  | 'onClick'
>;

/** Adds physical press feedback without taking ownership of native command activation. */
export function useCommandPress({
  disabled,
  enabled = true,
  ...handlers
}: ButtonHandlers & { disabled?: boolean | undefined; enabled?: boolean | undefined }) {
  const [held, setHeld] = useState(false);
  const [pressed, setPressed] = useState(false);
  const source = useRef<'pointer' | 'space' | 'enter' | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const canceledPointer = useRef(false);
  const canceledSpace = useRef(false);
  const pointerId = useRef<number | null>(null);

  const release = () => {
    source.current = null;
    pointerId.current = null;
    setHeld(false);
    setPressed(false);
  };
  const cancel = () => {
    if (source.current === 'pointer') canceledPointer.current = true;
    if (source.current === 'space') canceledSpace.current = true;
    release();
  };

  useEffect(() => {
    if (disabled || !enabled) cancel();
  }, [disabled, enabled]);

  useEffect(() => {
    if (!enabled || !held) return;
    const element = button.current;
    const document = element?.ownerDocument;
    const window = document?.defaultView;
    const localRoot = element?.getRootNode();
    const onPointerUp = (event: PointerEvent) => {
      if (source.current !== 'pointer' || event.pointerId !== pointerId.current) return;
      if (!isComposedEventWithinElement(event, element)) {
        canceledPointer.current = true;
      }
      release();
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === pointerId.current) cancel();
    };
    const onVisibility = () => {
      if (document?.hidden) cancel();
    };
    const onExternalEscape = (event: Event) => {
      if ('key' in event && event.key === 'Escape' && !isComposedEventWithinElement(event, element))
        cancel();
    };
    document?.addEventListener('pointerup', onPointerUp, true);
    document?.addEventListener('pointercancel', onPointerCancel, true);
    document?.addEventListener('visibilitychange', onVisibility);
    document?.addEventListener('keydown', onExternalEscape, true);
    // Content editing bridges deliver local key events inside their ShadowRoot.
    if (localRoot instanceof ShadowRoot)
      localRoot.addEventListener('keydown', onExternalEscape, true);
    window?.addEventListener('blur', cancel);
    return () => {
      document?.removeEventListener('pointerup', onPointerUp, true);
      document?.removeEventListener('pointercancel', onPointerCancel, true);
      document?.removeEventListener('visibilitychange', onVisibility);
      document?.removeEventListener('keydown', onExternalEscape, true);
      if (localRoot instanceof ShadowRoot)
        localRoot.removeEventListener('keydown', onExternalEscape, true);
      window?.removeEventListener('blur', cancel);
    };
  }, [held, enabled]);

  const props: ButtonHandlers = {
    onPointerDown(event) {
      handlers.onPointerDown?.(event);
      if (disabled || event.currentTarget.matches(':disabled') || event.button !== 0) return;
      button.current = event.currentTarget;
      source.current = 'pointer';
      pointerId.current = event.pointerId;
      canceledPointer.current = false;
      setHeld(true);
      setPressed(true);
    },
    onPointerEnter(event) {
      handlers.onPointerEnter?.(event);
      if (source.current === 'pointer' && event.buttons & 1) setPressed(true);
    },
    onPointerLeave(event) {
      handlers.onPointerLeave?.(event);
      if (source.current === 'pointer') setPressed(false);
    },
    onPointerCancel(event) {
      handlers.onPointerCancel?.(event);
      cancel();
    },
    onLostPointerCapture(event) {
      handlers.onLostPointerCapture?.(event);
      if (source.current === 'pointer') cancel();
    },
    onKeyDown(event) {
      handlers.onKeyDown?.(event);
      if (event.key === 'Escape' && source.current !== null) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return;
      }
      if (
        disabled ||
        event.currentTarget.matches(':disabled') ||
        event.defaultPrevented ||
        (event.key !== ' ' && event.key !== 'Enter')
      )
        return;
      if (event.repeat) {
        if (event.key === 'Enter') event.preventDefault();
        return;
      }
      canceledSpace.current = false;
      button.current = event.currentTarget;
      source.current = event.key === ' ' ? 'space' : 'enter';
      setHeld(true);
      setPressed(true);
    },
    onKeyUp(event) {
      handlers.onKeyUp?.(event);
      if (event.key === ' ' && canceledSpace.current) {
        event.preventDefault();
        canceledSpace.current = false;
      }
      if (event.key === ' ' || event.key === 'Enter') release();
    },
    onBlur(event) {
      handlers.onBlur?.(event);
      cancel();
    },
    onClick(event) {
      if (
        disabled ||
        event.currentTarget.matches(':disabled') ||
        (event.detail > 0 && canceledPointer.current)
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      handlers.onClick?.(event);
    },
  };
  return { pressed: enabled && !disabled && pressed, props: enabled ? props : handlers };
}
