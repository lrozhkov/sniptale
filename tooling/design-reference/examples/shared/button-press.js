let active = null,
  canceledSpace = null;
const blocked = new WeakSet();
const target = (event) =>
  event.target instanceof Element
    ? event.target.closest(
        'button.action-button:not([data-press-feedback=off]),button[data-repeat-command]'
      )
    : null;
const available = (button) =>
  button && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
function paint(button, value) {
  if (button.dataset.down !== String(value)) button.dataset.down = String(value);
}
function finish(cancel = false) {
  if (!active) return;
  const current = active;
  active = null;
  paint(current.button, false);
  if (cancel && current.kind === 'pointer') blocked.add(current.button);
  if (cancel && current.kind === 'key' && current.key === ' ') canceledSpace = current.button;
}
function inside(button, event) {
  const r = button.getBoundingClientRect();
  return (
    event.clientX >= r.left &&
    event.clientX < r.right &&
    event.clientY >= r.top &&
    event.clientY < r.bottom
  );
}
document.addEventListener(
  'pointerdown',
  (event) => {
    const button = target(event);
    if (event.button !== 0 || !available(button)) return;
    if (active) finish(true);
    blocked.delete(button);
    active = { kind: 'pointer', button, pointerId: event.pointerId };
    paint(button, true);
  },
  true
);
document.addEventListener(
  'pointermove',
  (event) => {
    if (active?.kind === 'pointer' && active.pointerId === event.pointerId)
      paint(
        active.button,
        active.button.hasAttribute('data-repeat-command') || inside(active.button, event)
      );
  },
  true
);
document.addEventListener(
  'pointerup',
  (event) => {
    if (active?.kind !== 'pointer' || active.pointerId !== event.pointerId) return;
    const button = active.button,
      accept = inside(button, event);
    finish(!accept);
  },
  true
);
for (const name of ['pointercancel', 'lostpointercapture'])
  document.addEventListener(
    name,
    (event) => {
      if (active?.kind === 'pointer' && active.pointerId === event.pointerId) finish(true);
    },
    true
  );
document.addEventListener(
  'keydown',
  (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape' && active) {
      finish(true);
      return;
    }
    if (!['Enter', ' '].includes(event.key)) return;
    const button = target(event);
    if (!button) return;
    if (!available(button)) {
      event.preventDefault();
      return;
    }
    if (event.repeat && !button.hasAttribute('data-repeat-command')) {
      event.preventDefault();
      return;
    }
    blocked.delete(button);
    canceledSpace = null;
    if (active) finish();
    active = { kind: 'key', key: event.key, button };
    paint(button, true);
  },
  true
);
document.addEventListener(
  'keyup',
  (event) => {
    if (event.key === ' ' && canceledSpace) {
      event.preventDefault();
      canceledSpace = null;
    }
    if (active?.kind === 'key' && active.key === event.key) finish();
  },
  true
);
document.addEventListener(
  'focusout',
  (event) => {
    if (active?.button === event.target) finish(true);
  },
  true
);
document.addEventListener(
  'click',
  (event) => {
    const button = target(event);
    if (!button) return;
    if (!available(button) || (event.detail > 0 && blocked.has(button))) {
      blocked.delete(button);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true
);
window.addEventListener('blur', () => finish(true));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) finish(true);
});
