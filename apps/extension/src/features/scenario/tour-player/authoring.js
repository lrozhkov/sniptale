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
      point = object.constrainPoint?.(point) ?? point;
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

/** Image placement owns one pointer gesture, preview rollback and one accepted commit. */
export function bindTourImagePlacement(node, plane, slide, box, callbacks, lifetime) {
  node.style.pointerEvents = 'auto';
  node.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || lifetime.aborted || callbacks.canEdit?.() === false) return;
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const original = slide.imagePlacement ?? { center: { x: 0.5, y: 0.5 }, zoom: 1 };
    const gesture = new AbortController();
    let placement = original;
    const finish = () => {
      gesture.abort();
      plane.style.transform = '';
      lifetime.removeEventListener('abort', cancel);
      if (node.hasPointerCapture?.(pointerId)) node.releasePointerCapture(pointerId);
    };
    const cancel = () => {
      if (!gesture.signal.aborted) finish();
    };
    node.addEventListener(
      'pointermove',
      (next) => {
        if (next.pointerId !== pointerId) return;
        if (callbacks.canEdit?.() === false) return cancel();
        const clamp = (value) => Math.max(0, Math.min(1, value));
        placement = {
          ...original,
          center: {
            x: clamp(original.center.x - (next.clientX - event.clientX) / box.width),
            y: clamp(original.center.y - (next.clientY - event.clientY) / box.height),
          },
        };
        const offsetX = (original.center.x - placement.center.x) * box.width;
        const offsetY = (original.center.y - placement.center.y) * box.height;
        plane.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      },
      { signal: gesture.signal }
    );
    node.addEventListener(
      'pointerup',
      (next) => {
        if (next.pointerId !== pointerId) return;
        if (callbacks.canEdit?.() === false) return cancel();
        finish();
        if (placement !== original) callbacks.onFrameImage?.(placement);
      },
      { signal: gesture.signal }
    );
    node.ownerDocument.defaultView?.addEventListener('blur', cancel, { signal: gesture.signal });
    node.addEventListener('pointercancel', cancel, { signal: gesture.signal });
    node.addEventListener('lostpointercapture', cancel, { signal: gesture.signal });
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
    node.setPointerCapture?.(pointerId);
  });
}
