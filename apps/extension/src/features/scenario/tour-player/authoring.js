/** A point gesture previews in source coordinates and commits once; cancellation restores the node. */
export function bindTourObjectDrag(node, object, box, callbacks, lifetime) {
  node.dataset.tourObjectId = object.id;
  node.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || lifetime.aborted || callbacks.canEdit?.() === false) return;
    event.preventDefault();
    event.stopPropagation();
    node.focus({ preventScroll: true });
    const document = node.ownerDocument;
    const scene = node.closest('.tour-scene');
    const pointerId = event.pointerId;
    const start = { x: event.clientX, y: event.clientY };
    const original = { left: node.style.left, top: node.style.top };
    let point = object.point;
    let moved = false;
    const gesture = new AbortController();
    const cleanup = () => {
      gesture.abort();
      lifetime.removeEventListener('abort', cancel);
      if (node.hasPointerCapture?.(pointerId)) node.releasePointerCapture(pointerId);
      if (scene) delete scene.dataset.dragging;
    };
    const cancel = () => {
      if (gesture.signal.aborted) return;
      node.style.left = original.left;
      node.style.top = original.top;
      cleanup();
    };
    const move = (next) => {
      if (next.pointerId !== pointerId) return;
      if (callbacks.canEdit?.() === false) return cancel();
      const dx = next.clientX - start.x;
      const dy = next.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      point = {
        x: Math.max(0, Math.min(object.maxX ?? 1, object.point.x + dx / box.width)),
        y: Math.max(0, Math.min(object.maxY ?? 1, object.point.y + dy / box.height)),
      };
      node.style.left = `${box.x + point.x * box.width}px`;
      node.style.top = `${box.y + point.y * box.height}px`;
      if (scene) scene.dataset.dragging = 'true';
    };
    node.addEventListener('pointermove', move, { signal: gesture.signal });
    node.addEventListener(
      'pointerup',
      (next) => {
        if (next.pointerId !== pointerId) return;
        if (callbacks.canEdit?.() === false) return cancel();
        cleanup();
        if (moved) callbacks.onMoveObject(object.id, point);
        callbacks.onSelectObject(object.id);
      },
      { signal: gesture.signal }
    );
    node.addEventListener('pointercancel', cancel, { signal: gesture.signal });
    node.addEventListener('lostpointercapture', cancel, { signal: gesture.signal });
    document.addEventListener(
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
    node.setPointerCapture?.(pointerId);
  });
}
