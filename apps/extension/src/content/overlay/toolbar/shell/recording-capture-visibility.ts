import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';
import { CaptureMode, type SelectedArea } from '@sniptale/runtime-contracts/video/types/types';

function hasUsableBounds(bounds: SelectedArea): boolean {
  return (
    [
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      bounds.x + bounds.width,
      bounds.y + bounds.height,
    ].every(Number.isFinite) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

/** Measures whether the shell is outside the actual recording crop in CSS viewport coordinates. */
export function useRecordingCaptureVisibility(params: {
  active: boolean;
  captureMode: CaptureMode | null | undefined;
  cropRegion: SelectedArea | null | undefined;
  positionReady: boolean;
  toolbarRef: RefObject<HTMLDivElement | null>;
}): boolean {
  const { active, captureMode, cropRegion, positionReady, toolbarRef } = params;
  const [outsideCapture, setOutsideCapture] = useState(false);
  const measure = useCallback(() => {
    const toolbar = toolbarRef.current;
    let outside = false;
    if (
      active &&
      positionReady &&
      captureMode === CaptureMode.TAB_CROP &&
      cropRegion &&
      cropRegion.x >= 0 &&
      cropRegion.y >= 0 &&
      hasUsableBounds(cropRegion) &&
      toolbar
    ) {
      // The selected crop and getBoundingClientRect already include the actual CSS viewport scale.
      const bounds = toolbar.getBoundingClientRect();
      outside =
        hasUsableBounds(bounds) &&
        (bounds.right <= cropRegion.x ||
          bounds.left >= cropRegion.x + cropRegion.width ||
          bounds.bottom <= cropRegion.y ||
          bounds.top >= cropRegion.y + cropRegion.height);
    }
    setOutsideCapture((previous) => (previous === outside ? previous : outside));
  }, [active, captureMode, cropRegion, positionReady, toolbarRef]);

  // Measure each committed placement, orientation, content, and UI-scale update before paint.
  useLayoutEffect(() => {
    measure();
  });

  useLayoutEffect(() => {
    if (!active || !positionReady || captureMode !== CaptureMode.TAB_CROP || !toolbarRef.current) {
      return;
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(toolbarRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [active, captureMode, measure, positionReady, toolbarRef]);

  return outsideCapture;
}
