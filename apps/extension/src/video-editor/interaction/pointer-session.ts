interface WindowPointerSessionParams {
  cursor?: 'grabbing' | 'ew-resize';
  onMove: (event: PointerEvent) => void;
  onEnd?: () => void;
  onCancel?: () => void;
}

/**
 * Starts a window-level pointer session with explicit cleanup for unmount and reroute paths.
 */
export function startWindowPointerSession(params: WindowPointerSessionParams): () => void {
  let active = true;
  // A session owns its override node, so stale cleanup cannot release a newer drag.
  const cursorStyle = params.cursor ? document.createElement('style') : null;
  if (cursorStyle) {
    cursorStyle.setAttribute('data-video-editor-pointer-cursor', '');
    // Important rules in the first Tailwind layer outrank important resize/button utilities.
    cursorStyle.textContent = [
      '@layer theme { :root:root:root, :root:root:root * {',
      `cursor: ${params.cursor} !important; } }`,
    ].join(' ');
    document.head.appendChild(cursorStyle);
  }

  const cleanup = () => {
    if (!active) {
      return;
    }

    active = false;
    cursorStyle?.remove();
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
  if (params.onCancel) window.addEventListener('keydown', handleKeyDown, true);
  if (params.onCancel || params.cursor) window.addEventListener('blur', handleCancel);

  return cleanup;
}
