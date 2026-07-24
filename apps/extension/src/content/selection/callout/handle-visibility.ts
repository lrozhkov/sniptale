import React from 'react';

const HANDLE_HIDE_GRACE_MS = 320;

export function useCalloutHandleVisibility(isDragging: boolean) {
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
    if (isDragging) return;
    if (hoverLeaveTimeoutRef.current !== null) {
      window.clearTimeout(hoverLeaveTimeoutRef.current);
    }
    hoverLeaveTimeoutRef.current = window.setTimeout(() => {
      hoverLeaveTimeoutRef.current = null;
      setIsHovered(false);
    }, HANDLE_HIDE_GRACE_MS);
  }, [isDragging]);

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
    isVisible: isHovered || isDragging,
  };
}
