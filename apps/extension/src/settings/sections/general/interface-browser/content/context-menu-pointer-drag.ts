type DragSource = { key: string; origin: 'tree' | 'catalog' };
type PointerDragCallbacks = {
  accept(source: DragSource): boolean;
  move(source: DragSource, hit: Element | null, x: number, y: number): void;
  commit(source: DragSource): void;
  end(): void;
};

function createPreview(root: HTMLElement, source: HTMLElement, x: number, y: number) {
  const rect = source.getBoundingClientRect();
  const preview = source.cloneNode(true);
  if (!(preview instanceof HTMLElement)) throw new Error('Invalid menu row');
  for (const element of [preview, ...preview.querySelectorAll('*')]) {
    element.removeAttribute('id');
    element.removeAttribute('data-tree-key');
    element.removeAttribute('data-context-menu-source');
  }
  preview.classList.add('context-menu-drag-preview');
  preview.setAttribute('aria-hidden', 'true');
  preview.inert = true;
  Object.assign(preview.style, {
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    left: '0',
    top: '0',
  });
  root.append(preview);
  const offset = { x: x - rect.left, y: y - rect.top };
  return {
    remove: () => preview.remove(),
    move: (nextX: number, nextY: number) => {
      preview.style.transform = `translate3d(${nextX - offset.x}px, ${nextY - offset.y}px, 0)`;
    },
  };
}

function scrollAtPointer(hit: Element | null, root: HTMLElement, y: number) {
  const scroller = hit?.closest<HTMLElement>('[data-context-menu-scroll]');
  if (!scroller || !root.contains(scroller)) return;
  const rect = scroller.getBoundingClientRect();
  const edge = 28;
  const speed =
    y < rect.top + edge
      ? -Math.min(12, (rect.top + edge - y) / 2)
      : y > rect.bottom - edge
        ? Math.min(12, (y - rect.bottom + edge) / 2)
        : 0;
  if (speed) scroller.scrollTop += speed;
}

function startSession(
  root: HTMLElement,
  event: PointerEvent,
  sourceElement: HTMLElement,
  source: DragSource,
  callbacks: PointerDragCallbacks,
  suppressClick: () => void
) {
  const owner = root.ownerDocument;
  const view = owner.defaultView!;
  let preview: ReturnType<typeof createPreview> | null = null;
  let point = { x: event.clientX, y: event.clientY };
  let frame = 0;
  let closed = false;
  const update = () => {
    const hit = owner.elementFromPoint?.(point.x, point.y) ?? null;
    preview?.move(point.x, point.y);
    callbacks.move(source, hit && root.contains(hit) ? hit : null, point.x, point.y);
    return hit;
  };
  const animate = () => {
    if (closed || !preview) return;
    scrollAtPointer(update(), root, point.y);
    frame = view.requestAnimationFrame(animate);
  };
  const finish = (commit: boolean) => {
    if (closed) return;
    closed = true;
    view.cancelAnimationFrame(frame);
    if (preview) {
      suppressClick();
      preview.remove();
      sourceElement.removeAttribute('data-context-menu-moving');
      root.removeAttribute('data-context-menu-dragging');
    }
    view.removeEventListener('pointermove', move, true);
    view.removeEventListener('pointerup', up, true);
    view.removeEventListener('pointercancel', cancelEvent, true);
    view.removeEventListener('keydown', key, true);
    view.removeEventListener('blur', cancel);
    root.removeEventListener('lostpointercapture', cancelEvent);
    if (root.hasPointerCapture?.(event.pointerId)) root.releasePointerCapture(event.pointerId);
    if (preview && commit) callbacks.commit(source);
    callbacks.end();
  };
  const move = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return;
    point = { x: next.clientX, y: next.clientY };
    if (!preview && Math.hypot(point.x - event.clientX, point.y - event.clientY) < 5) return;
    next.preventDefault();
    if (!preview) {
      root.setPointerCapture?.(event.pointerId);
      preview = createPreview(root, sourceElement, event.clientX, event.clientY);
      sourceElement.setAttribute('data-context-menu-moving', 'true');
      root.setAttribute('data-context-menu-dragging', 'true');
      frame = view.requestAnimationFrame(animate);
    }
    update();
  };
  const up = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return;
    point = { x: next.clientX, y: next.clientY };
    if (preview) update();
    finish(true);
  };
  const cancel = () => finish(false);
  const cancelEvent = (next: Event) => {
    if ('pointerId' in next && next.pointerId !== event.pointerId) return;
    cancel();
  };
  const key = (next: KeyboardEvent) => {
    if (next.key !== 'Escape') return;
    next.preventDefault();
    next.stopPropagation();
    cancel();
  };
  view.addEventListener('pointermove', move, { capture: true, passive: false });
  view.addEventListener('pointerup', up, true);
  view.addEventListener('pointercancel', cancelEvent, true);
  view.addEventListener('keydown', key, true);
  view.addEventListener('blur', cancel);
  root.addEventListener('lostpointercapture', cancelEvent);
  return cancel;
}

/** Local pointer owner: one captured gesture, full-row preview, scrolling and complete cleanup. */
export function bindContextMenuPointerDrag(root: HTMLElement, callbacks: PointerDragCallbacks) {
  let cancel: (() => void) | undefined;
  let suppress = false;
  const down = (event: PointerEvent) => {
    suppress = false;
    if (event.button !== 0 || event.isPrimary === false || !(event.target instanceof Element))
      return;
    const handle = event.target.closest<HTMLElement>('[data-context-menu-source]');
    if (!handle || !root.contains(handle)) return;
    const origin = handle.dataset['contextMenuSource'];
    const row = handle.closest<HTMLElement>('[data-tree-key]') ?? handle;
    const key = row.dataset['treeKey'] ?? handle.dataset['commandKey'];
    if (!key || (origin !== 'tree' && origin !== 'catalog')) return;
    const source: DragSource = { key, origin };
    if (!callbacks.accept(source)) return;
    cancel?.();
    event.preventDefault();
    row.focus({ preventScroll: true });
    cancel = startSession(root, event, row, source, callbacks, () => {
      suppress = true;
    });
  };
  const click = (event: MouseEvent) => {
    if (!suppress || event.detail === 0) return;
    suppress = false;
    event.preventDefault();
    event.stopPropagation();
  };
  root.addEventListener('pointerdown', down);
  root.addEventListener('click', click, true);
  return () => {
    cancel?.();
    root.removeEventListener('pointerdown', down);
    root.removeEventListener('click', click, true);
  };
}
