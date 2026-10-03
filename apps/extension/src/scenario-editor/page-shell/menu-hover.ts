import { useEffect, useRef, type RefObject, type SetStateAction, type Dispatch } from 'react';

/** Keeps a portaled menu reachable while the pointer crosses the anchor-to-menu gap. */
export function useGuideMenuHover(
  enabled: boolean,
  disabled: boolean,
  menuRef: RefObject<HTMLDivElement | null>,
  setOpen: Dispatch<SetStateAction<boolean>>,
  delayedOpen = false
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const enter = () => {
    if (!enabled || disabled) return;
    cancel();
    if (delayedOpen) timer.current = setTimeout(() => setOpen(true), 180);
    else setOpen(true);
  };
  const leave = () => {
    if (!enabled) return;
    cancel();
    timer.current = setTimeout(() => {
      if (menuRef.current?.contains(document.activeElement)) return;
      setOpen(false);
    }, 180);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [enabled, disabled, delayedOpen]
  );
  return { enter, leave, cancel };
}
