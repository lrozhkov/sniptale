import { useEffect, useRef, type RefObject, type SetStateAction, type Dispatch } from 'react';

/** Keeps a portaled menu reachable while the pointer crosses the anchor-to-menu gap. */
export function useGuideMenuHover(
  enabled: boolean,
  disabled: boolean,
  menuRef: RefObject<HTMLDivElement | null>,
  setOpen: Dispatch<SetStateAction<boolean>>
) {
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const enter = () => {
    if (!enabled || disabled) return;
    cancel();
    setOpen(true);
  };
  const leave = () => {
    if (!enabled) return;
    cancel();
    closeTimer.current = setTimeout(() => {
      if (menuRef.current?.contains(document.activeElement)) return;
      setOpen(false);
    }, 180);
  };
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );
  return { enter, leave, cancel };
}
