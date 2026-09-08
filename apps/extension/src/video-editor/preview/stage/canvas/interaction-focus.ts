import { useEffect, useState, type RefObject } from 'react';

/** Keeps canvas manipulation local while the inspector shares the selected project object. */
export function usePreviewCanvasInteractionFocus(stageRef: RefObject<HTMLDivElement | null>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const updateSurface = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const stage = stageRef.current;
      if (stage?.contains(event.target)) {
        setActive(true);
        if (event.type === 'pointerdown') stage.focus({ preventScroll: true });
      } else if (event.target.closest('[data-ui="video-editor.timeline.surface"]')) {
        setActive(false);
      }
    };
    document.addEventListener('pointerdown', updateSurface, true);
    document.addEventListener('focusin', updateSurface, true);
    return () => {
      document.removeEventListener('pointerdown', updateSurface, true);
      document.removeEventListener('focusin', updateSurface, true);
    };
  }, [stageRef]);
  return active;
}
