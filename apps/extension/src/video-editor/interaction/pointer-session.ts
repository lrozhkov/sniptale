interface WindowPointerSessionParams {
  onMove: (event: PointerEvent) => void;
  onEnd?: () => void;
  onCancel?: () => void;
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
    window.removeEventListener('pointercancel', handleCancel);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('blur', handleCancel);
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

    cleanup();
    params.onEnd?.();
  };

  const handleCancel = () => {
    if (!active) return;
    cleanup();
    (params.onCancel ?? params.onEnd)?.();
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !params.onCancel) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handleCancel();
  };

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleEnd);
  window.addEventListener('pointercancel', handleCancel);
  if (params.onCancel) {
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', handleCancel);
  }

  return cleanup;
}
