import { useEffect, useMemo } from 'react';
import {
  createInteractiveFramePointerMoveHandler,
  createInteractiveFramePointerUpHandler,
} from '../editing/pointer-actions';
import type { InteractiveFrameListenerConfig } from './types';

export function useInteractiveFramePointerListeners(params: InteractiveFrameListenerConfig) {
  const handleMouseMove = useMemo(() => createInteractiveFramePointerMoveHandler(params), [params]);
  const handleMouseUp = useMemo(
    () =>
      createInteractiveFramePointerUpHandler({
        isDraggingRef: params.isDraggingRef,
        isResizingRef: params.isResizingRef,
        resizeDirectionRef: params.resizeDirectionRef,
      }),
    [params.isDraggingRef, params.isResizingRef, params.resizeDirectionRef]
  );

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove, { capture: true });
    document.addEventListener('mouseup', handleMouseUp, { capture: true });

    return () => {
      document.removeEventListener('mousemove', handleMouseMove, { capture: true });
      document.removeEventListener('mouseup', handleMouseUp, { capture: true });
    };
  }, [handleMouseMove, handleMouseUp]);
}
