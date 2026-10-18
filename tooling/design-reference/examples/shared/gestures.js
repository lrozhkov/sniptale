let active = null;
export function bindGesture(target, { start, move, commit, cancel }) {
  const events = new AbortController(),
    options = { signal: events.signal };
  let current = null;
  function finish(accept) {
    if (!current) return;
    const pointer = current.pointerId;
    current = null;
    active = null;
    delete target.dataset.dragging;
    delete target.dataset.pointerId;
    if (target.hasPointerCapture(pointer)) target.releasePointerCapture(pointer);
    (accept ? commit : cancel)?.();
  }
  target.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 || active) return;
      event.preventDefault();
      event.stopPropagation();
      target.focus({ preventScroll: true });
      current = { pointerId: event.pointerId };
      active = { cancel: () => finish(false) };
      target.dataset.dragging = 'true';
      target.dataset.pointerId = String(event.pointerId);
      target.setPointerCapture(event.pointerId);
      start?.(event);
    },
    options
  );
  target.addEventListener(
    'pointermove',
    (event) => {
      if (current?.pointerId === event.pointerId) move?.(event);
    },
    options
  );
  target.addEventListener(
    'pointerup',
    (event) => {
      if (current?.pointerId === event.pointerId) finish(true);
    },
    options
  );
  for (const type of ['pointercancel', 'lostpointercapture'])
    target.addEventListener(
      type,
      (event) => {
        if (current?.pointerId === event.pointerId) finish(false);
      },
      options
    );
  return {
    cancel: () => finish(false),
    destroy() {
      finish(false);
      events.abort();
    },
  };
}
window.addEventListener('blur', () => active?.cancel());
window.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Escape' && active) {
      event.preventDefault();
      event.stopImmediatePropagation();
      active.cancel();
    }
  },
  true
);
