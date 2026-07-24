import { useEffect, useMemo, useRef } from 'react';
import {
  createInteractiveFramePointerAbortHandler,
  createInteractiveFramePointerCancelHandler,
  createInteractiveFramePointerMoveHandler,
  createInteractiveFramePointerUpHandler,
} from '../editing/pointer-actions';
import type { InteractiveFrameListenerConfig } from './types';

export function useInteractiveFramePointerListeners(params: InteractiveFrameListenerConfig) {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const handlers = useMemo(
    () => ({
      abort: () => createInteractiveFramePointerAbortHandler(paramsRef.current)(),
      cancel: () => createInteractiveFramePointerCancelHandler(paramsRef.current)(),
      move: (event: PointerEvent) =>
        createInteractiveFramePointerMoveHandler(paramsRef.current)(event),
      up: (event: PointerEvent) => createInteractiveFramePointerUpHandler(paramsRef.current)(event),
    }),
    []
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !handlers.cancel()) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const handleWindowBlur = () => handlers.cancel();
    document.addEventListener('pointermove', handlers.move, { capture: true });
    document.addEventListener('pointerup', handlers.up, { capture: true });
    document.addEventListener('pointercancel', handlers.cancel, { capture: true });
    document.addEventListener('lostpointercapture', handlers.cancel, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      handlers.abort();
      document.removeEventListener('pointermove', handlers.move, { capture: true });
      document.removeEventListener('pointerup', handlers.up, { capture: true });
      document.removeEventListener('pointercancel', handlers.cancel, { capture: true });
      document.removeEventListener('lostpointercapture', handlers.cancel, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [handlers]);

  return handlers.abort;
}
