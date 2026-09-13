/** Resizes a source-coordinate rectangle, keeping its opposite edge fixed and inside the image. */
export function resizeTourRect(rect, edge, dx, dy) {
  const min = 0.001;
  let left = rect.x,
    top = rect.y;
  let right = rect.x + rect.width,
    bottom = rect.y + rect.height;
  if (edge.includes('w')) left = Math.max(0, Math.min(right - min, left + dx));
  if (edge.includes('e')) right = Math.min(1, Math.max(left + min, right + dx));
  if (edge.includes('n')) top = Math.max(0, Math.min(bottom - min, top + dy));
  if (edge.includes('s')) bottom = Math.min(1, Math.max(top + min, bottom + dy));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Handles own pointer capture, preview rollback and a single commit; no document mutation on move. */
export function bindTourRectResize(node, object, box, callbacks, lifetime, label) {
  const project = (rect) =>
    Object.assign(node.style, {
      left: `${box.x + rect.x * box.width}px`,
      top: `${box.y + rect.y * box.height}px`,
      width: `${rect.width * box.width}px`,
      height: `${rect.height * box.height}px`,
    });
  for (const edge of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
    const handle = node.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.className = 'tour-resize-handle';
    handle.dataset.edge = edge;
    handle.setAttribute('aria-label', label);
    handle.addEventListener('click', (event) => event.stopPropagation());
    handle.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (lifetime.aborted || callbacks.canEdit?.() === false) return;
      const step = event.shiftKey ? 10 : 1;
      const dx =
        (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0) / box.width;
      const dy =
        (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) / box.height;
      callbacks.onResizeObject?.(object.id, resizeTourRect(object.rect, edge, dx, dy));
    });
    handle.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      if (event.button !== 0 || lifetime.aborted || callbacks.canEdit?.() === false) return;
      event.preventDefault();
      const pointerId = event.pointerId;
      const gesture = new AbortController();
      const scene = node.closest('.tour-scene');
      let rect = object.rect;
      let moved = false;
      const cleanup = () => {
        gesture.abort();
        lifetime.removeEventListener('abort', cancel);
        if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
        if (scene) delete scene.dataset.resizing;
      };
      const cancel = () => {
        project(object.rect);
        cleanup();
      };
      handle.addEventListener(
        'pointermove',
        (next) => {
          if (next.pointerId !== pointerId) return;
          if (callbacks.canEdit?.() === false || !node.isConnected) return cancel();
          const dx = next.clientX - event.clientX,
            dy = next.clientY - event.clientY;
          if (!moved && Math.hypot(dx, dy) < 3) return;
          moved = true;
          rect = resizeTourRect(object.rect, edge, dx / box.width, dy / box.height);
          project(rect);
          if (scene) scene.dataset.resizing = edge;
        },
        { signal: gesture.signal }
      );
      handle.addEventListener(
        'pointerup',
        (next) => {
          if (next.pointerId !== pointerId) return;
          if (callbacks.canEdit?.() === false || !node.isConnected) return cancel();
          cleanup();
          if (moved) callbacks.onResizeObject?.(object.id, rect);
        },
        { signal: gesture.signal }
      );
      handle.addEventListener('pointercancel', cancel, { signal: gesture.signal });
      handle.addEventListener('lostpointercapture', cancel, { signal: gesture.signal });
      node.ownerDocument.addEventListener(
        'keydown',
        (key) => {
          if (key.key !== 'Escape') return;
          key.preventDefault();
          key.stopPropagation();
          cancel();
        },
        { capture: true, signal: gesture.signal }
      );
      lifetime.addEventListener('abort', cancel, { once: true });
      handle.setPointerCapture?.(pointerId);
    });
    node.append(handle);
  }
}
