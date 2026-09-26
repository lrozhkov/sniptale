import { useEffect } from 'react';

/** Keeps Ctrl+wheel inside the standalone editor from scaling the browser page. */
export function useVideoEditorWheelZoomGuard(): void {
  useEffect(() => {
    const preventPageZoom = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    window.addEventListener('wheel', preventPageZoom, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', preventPageZoom, true);
  }, []);
}
