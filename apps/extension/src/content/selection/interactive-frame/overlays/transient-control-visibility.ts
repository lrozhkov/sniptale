import React from 'react';

const CONTROL_HIDE_GRACE_MS = 320;

/** Keeps hover-only controls reachable while the pointer crosses their small portal gap. */
export function useTransientControlVisibility(isPinned: boolean) {
  const [isHovered, setIsHovered] = React.useState(false);
  const hoverLeaveTimeoutRef = React.useRef<number | null>(null);

  const show = React.useCallback(() => {
    if (hoverLeaveTimeoutRef.current !== null) {
      window.clearTimeout(hoverLeaveTimeoutRef.current);
      hoverLeaveTimeoutRef.current = null;
    }
    setIsHovered(true);
  }, []);

  const scheduleHide = React.useCallback(() => {
    if (isPinned) return;
    if (hoverLeaveTimeoutRef.current !== null) {
      window.clearTimeout(hoverLeaveTimeoutRef.current);
    }
    hoverLeaveTimeoutRef.current = window.setTimeout(() => {
      hoverLeaveTimeoutRef.current = null;
      setIsHovered(false);
    }, CONTROL_HIDE_GRACE_MS);
  }, [isPinned]);

  React.useEffect(() => {
    return () => {
      if (hoverLeaveTimeoutRef.current !== null) {
        window.clearTimeout(hoverLeaveTimeoutRef.current);
      }
    };
  }, []);

  return {
    handleBlur: scheduleHide,
    handleFocus: show,
    handleMouseEnter: show,
    handleMouseLeave: scheduleHide,
    isVisible: isHovered || isPinned,
  };
}
