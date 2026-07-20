import React from 'react';
import type { ResizeBehavior } from './measurement';

export function useAnimationFrameScheduler(callback: (behavior: ResizeBehavior) => void) {
  const frameRef = React.useRef<number | null>(null);

  const cancel = React.useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const schedule = React.useCallback(
    (behavior: ResizeBehavior) => {
      cancel();
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        callback(behavior);
      });
    },
    [callback, cancel]
  );

  React.useEffect(() => cancel, [cancel]);

  return { cancel, schedule };
}

export function useLayerPanelResizeObserver(args: {
  expanded: boolean;
  frameRef: React.RefObject<HTMLDivElement | null>;
  frozenAfterDeleteRef: React.MutableRefObject<boolean>;
  cancel: () => void;
  schedule: (behavior: ResizeBehavior) => void;
}) {
  const { expanded, frameRef, frozenAfterDeleteRef, cancel, schedule } = args;

  React.useEffect(() => {
    if (!expanded || typeof ResizeObserver === 'undefined') {
      return;
    }

    const resizeTarget = frameRef.current?.parentElement;
    if (!resizeTarget) {
      return;
    }

    const observer = new ResizeObserver(() => {
      schedule(frozenAfterDeleteRef.current ? 'clamp' : 'measure');
    });
    observer.observe(resizeTarget);
    return () => {
      observer.disconnect();
      cancel();
    };
  }, [expanded, frameRef, frozenAfterDeleteRef, cancel, schedule]);
}
