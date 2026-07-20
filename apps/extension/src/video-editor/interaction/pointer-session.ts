interface WindowPointerSessionParams {
  onMove: (event: PointerEvent) => void;
  onEnd?: () => void;
}

/**
 * Starts a window-level pointer session with explicit cleanup for unmount and reroute paths.
 */
export function startWindowPointerSession(params: WindowPointerSessionParams): () => void {
  let active = true;

  const cleanup = () => {
    if (!active) {
      return;
    }

    active = false;
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleEnd);
    window.removeEventListener('pointercancel', handleEnd);
  };

  const handleMove = (event: PointerEvent) => {
    if (!active) {
      return;
    }

    params.onMove(event);
  };

  const handleEnd = () => {
    if (!active) {
      return;
    }

    params.onEnd?.();
    cleanup();
  };

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleEnd);
  window.addEventListener('pointercancel', handleEnd);

  return cleanup;
}
