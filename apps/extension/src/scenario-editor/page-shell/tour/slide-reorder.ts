import { useEffect, useRef, type PointerEvent } from 'react';

/** A local pointer session owns slide preview, insertion position, scrolling and cleanup. */
export function useTourSlideReorder(
  revision: string,
  disabled: boolean,
  commit: (slideId: string, beforeId?: string) => void
) {
  const cancel = useRef<(() => void) | null>(null);
  const publish = useRef(commit);
  publish.current = commit;
  useEffect(() => {
    cancel.current?.();
    return () => cancel.current?.();
  }, [revision, disabled]);
  return (event: PointerEvent<HTMLButtonElement>, slideId: string) => {
    if (disabled || event.button !== 0 || event.isPrimary === false) return;
    cancel.current?.();
    cancel.current = startReorder(event, (beforeId) => publish.current(slideId, beforeId));
  };
}

function startReorder(event: PointerEvent<HTMLButtonElement>, commit: (beforeId?: string) => void) {
  const handle = event.currentTarget;
  const row = handle.closest<HTMLElement>('.tour-slide-row');
  const list = row?.closest<HTMLElement>('.tour-slide-list');
  const pane = list?.closest<HTMLElement>('.guide-panel-scroll');
  if (!row || !list || !pane) return () => {};
  const pointerId = event.pointerId;
  const start = { x: event.clientX, y: event.clientY };
  let position = start;
  let preview: HTMLElement | null = null;
  let marker: HTMLElement | null = null;
  let frame = 0;
  let closed = false;
  let destination: { beforeId?: string } | null = null;
  const clearMarker = () => {
    marker?.removeAttribute('data-slide-insertion');
    marker = null;
    destination = null;
  };
  const place = () => {
    clearMarker();
    if (!preview) return;
    const bounds = pane.getBoundingClientRect();
    preview.style.left = `${Math.max(0, Math.min(position.x + 12, innerWidth - preview.offsetWidth))}px`;
    preview.style.top = `${Math.max(0, Math.min(position.y + 12, innerHeight - preview.offsetHeight))}px`;
    if (
      position.x < bounds.left ||
      position.x > bounds.right ||
      position.y < bounds.top ||
      position.y > bounds.bottom
    )
      return;
    const rows = [...list.querySelectorAll<HTMLElement>('[data-tour-before]')];
    const remaining = rows.filter((entry) => entry !== row);
    const next = remaining.find((entry) => {
      const rect = entry.getBoundingClientRect();
      return position.y < rect.top + rect.height / 2;
    });
    const beforeId = next?.dataset['tourBefore'];
    const currentNext = rows[rows.indexOf(row) + 1]?.dataset['tourBefore'];
    if (beforeId === currentNext) return;
    marker = next ?? remaining.at(-1) ?? null;
    if (!marker) return;
    marker.dataset['slideInsertion'] = next ? 'before' : 'after';
    destination = beforeId ? { beforeId } : {};
  };
  const scroll = () => {
    if (closed || !preview) return;
    const bounds = pane.getBoundingClientRect();
    if (
      position.x >= bounds.left &&
      position.x <= bounds.right &&
      position.y >= bounds.top &&
      position.y <= bounds.bottom
    ) {
      const delta = position.y < bounds.top + 28 ? -8 : position.y > bounds.bottom - 28 ? 8 : 0;
      if (delta) {
        pane.scrollTop += delta;
        place();
      }
    }
    frame = requestAnimationFrame(scroll);
  };
  const move = (next: globalThis.PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    position = { x: next.clientX, y: next.clientY };
    if (!preview && Math.hypot(position.x - start.x, position.y - start.y) < 5) return;
    if (!preview) {
      const clone = row.querySelector('.tour-slide-select')?.cloneNode(true);
      if (!(clone instanceof HTMLElement)) return;
      preview = clone;
      preview.classList.add('tour-slide-drag-preview');
      preview.setAttribute('aria-hidden', 'true');
      preview.removeAttribute('aria-current');
      preview.inert = true;
      preview.style.width = `${row.getBoundingClientRect().width}px`;
      (list.closest('.guide-page') ?? list).append(preview);
      row.dataset['slideDragging'] = 'true';
      document.documentElement.dataset['tourReordering'] = 'true';
      frame = requestAnimationFrame(scroll);
    }
    next.preventDefault();
    place();
  };
  const cancel = () => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('blur', cancel);
    handle.removeEventListener('lostpointercapture', cancel);
    clearMarker();
    if (preview) handle.blur();
    preview?.remove();
    row.removeAttribute('data-slide-dragging');
    document.documentElement.removeAttribute('data-tour-reordering');
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
  };
  const finish = (next: globalThis.PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    position = { x: next.clientX, y: next.clientY };
    place();
    const result = destination;
    cancel();
    if (result) commit(result.beforeId);
  };
  const key = (next: KeyboardEvent) => {
    if (next.key !== 'Escape') return;
    next.preventDefault();
    next.stopPropagation();
    cancel();
  };
  event.preventDefault();
  event.stopPropagation();
  handle.focus({ preventScroll: true });
  handle.setPointerCapture(pointerId);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key, true);
  window.addEventListener('blur', cancel);
  handle.addEventListener('lostpointercapture', cancel);
  return cancel;
}
