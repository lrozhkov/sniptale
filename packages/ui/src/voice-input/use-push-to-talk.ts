import { useEffect, useRef, useState, type PointerEventHandler } from 'react';

const PUSH_TO_TALK_HOLD_MS = 450;

type PushToTalkControl = {
  holding: boolean;
  onPointerCancel: PointerEventHandler<HTMLButtonElement>;
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
  onPointerUp: PointerEventHandler<HTMLButtonElement>;
};

/** Starts on press and stops on release only after the press becomes an intentional hold. */
export function usePushToTalk(args: {
  active: boolean;
  disabled: boolean;
  onStart(): void;
  onStop(): void;
}): PushToTalkControl {
  const pressRef = useRef<{ holding: boolean; pointerId: number } | null>(null);
  const holdTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);

  const clearHoldTimeout = () => {
    if (holdTimeoutRef.current !== null) globalThis.clearTimeout(holdTimeoutRef.current);
    holdTimeoutRef.current = null;
  };

  const finishPress = (pointerId: number): boolean | null => {
    const press = pressRef.current;
    if (!press || press.pointerId !== pointerId) return null;
    pressRef.current = null;
    clearHoldTimeout();
    setHolding(false);
    return press.holding;
  };

  useEffect(
    () => () => {
      if (holdTimeoutRef.current !== null) {
        globalThis.clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }
      pressRef.current = null;
    },
    []
  );

  return {
    holding,
    onPointerCancel: (event) => {
      if (finishPress(event.pointerId) === null) return;
      args.onStop();
    },
    onPointerDown: (event) => {
      if (event.button !== 0 || args.active || args.disabled || pressRef.current) return;
      const pointerId = event.pointerId;
      pressRef.current = { holding: false, pointerId };
      event.currentTarget.setPointerCapture?.(pointerId);
      args.onStart();
      holdTimeoutRef.current = globalThis.setTimeout(() => {
        const press = pressRef.current;
        if (!press || press.pointerId !== pointerId) return;
        press.holding = true;
        setHolding(true);
      }, PUSH_TO_TALK_HOLD_MS);
    },
    onPointerUp: (event) => {
      if (finishPress(event.pointerId)) args.onStop();
    },
  };
}
