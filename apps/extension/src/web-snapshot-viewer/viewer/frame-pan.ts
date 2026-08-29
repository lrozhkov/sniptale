type Axis = 'x' | 'y';

type PanSession = {
  dragging: boolean;
  pointerId: number;
  scroller: HTMLElement;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
};

const PAN_EXCLUDED_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  '[contenteditable="true"]',
  '[data-sniptale-annotation]',
  '[data-sniptale-overlay-root]',
  '.sniptale-annotation',
  '.sniptale-callout',
].join(',');
const PAN_THRESHOLD_PX = 4;

function toElement(target: EventTarget | null): HTMLElement | null {
  if (!target || (target as Node).nodeType !== Node.ELEMENT_NODE) return null;
  const element = target as HTMLElement;
  return typeof element.closest === 'function' ? element : null;
}

function isClippedScrollable(element: HTMLElement, axis: Axis): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return false;
  const overflow = axis === 'x' ? style.overflowX : style.overflowY;
  const extent =
    axis === 'x'
      ? element.scrollWidth - element.clientWidth
      : element.scrollHeight - element.clientHeight;
  return overflow === 'hidden' && extent > 2;
}

function findClippedScrollableAncestor(target: HTMLElement, axis: Axis): HTMLElement | null {
  let current: HTMLElement | null = target;
  while (current && current !== current.ownerDocument.body) {
    if (isClippedScrollable(current, axis)) return current;
    current = current.parentElement;
  }
  return current && isClippedScrollable(current, axis) ? current : null;
}

function findClippedScrollable(target: HTMLElement): HTMLElement | null {
  return findClippedScrollableAncestor(target, 'x') ?? findClippedScrollableAncestor(target, 'y');
}

function moveClippedScroller(element: HTMLElement, axis: Axis, delta: number): boolean {
  const position = axis === 'x' ? element.scrollLeft : element.scrollTop;
  const maximum =
    axis === 'x'
      ? Math.max(0, element.scrollWidth - element.clientWidth)
      : Math.max(0, element.scrollHeight - element.clientHeight);
  const next = Math.max(0, Math.min(maximum, position + delta));
  if (next === position) return false;
  if (axis === 'x') element.scrollLeft = next;
  else element.scrollTop = next;
  return true;
}

function isPanExcludedTarget(target: HTMLElement): boolean {
  if (target.closest(PAN_EXCLUDED_SELECTOR)) return true;
  return target.childElementCount === 0 && (target.textContent?.trim().length ?? 0) > 0;
}

function createDragHint(doc: Document, label: string): HTMLElement {
  const hint = doc.createElement('div');
  hint.textContent = label;
  hint.setAttribute('aria-hidden', 'true');
  hint.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'display:none',
    'max-width:220px',
    'padding:5px 8px',
    'border-radius:6px',
    'background:rgba(24,24,27,.88)',
    'color:#fff',
    'font:500 11px/1.3 system-ui,sans-serif',
    'pointer-events:none',
    'box-shadow:0 2px 8px rgba(0,0,0,.2)',
  ].join(';');
  doc.body.append(hint);
  return hint;
}

function positionDragHint(hint: HTMLElement, scroller: HTMLElement): void {
  const rect = scroller.getBoundingClientRect();
  hint.style.left = `${Math.max(8, rect.left + 8)}px`;
  hint.style.top = `${Math.max(8, rect.top + 8)}px`;
  hint.style.display = 'block';
}

export function installSnapshotFramePan(doc: Document, dragHintLabel?: string): () => void {
  const cursorValues = new Map<HTMLElement, string>();
  const dragHint = dragHintLabel ? createDragHint(doc, dragHintLabel) : null;
  let dragHintConsumed = false;
  let panSession: PanSession | null = null;
  let suppressNextClick = false;

  const setPanCursor = (scroller: HTMLElement, value: 'grab' | 'grabbing') => {
    if (!cursorValues.has(scroller)) cursorValues.set(scroller, scroller.style.cursor);
    scroller.style.setProperty('cursor', value, 'important');
  };
  const restorePanCursor = (scroller: HTMLElement) => {
    const value = cursorValues.get(scroller);
    if (value === undefined) return;
    scroller.style.cursor = value;
    cursorValues.delete(scroller);
  };
  const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey) return;
    const target = toElement(event.target);
    if (!target) return;
    const horizontal = findClippedScrollableAncestor(target, 'x');
    const vertical = findClippedScrollableAncestor(target, 'y');
    const horizontalDelta = event.deltaX || (event.shiftKey || !vertical ? event.deltaY : 0);
    if (
      horizontal &&
      horizontalDelta !== 0 &&
      moveClippedScroller(horizontal, 'x', horizontalDelta)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (vertical && event.deltaY !== 0 && moveClippedScroller(vertical, 'y', event.deltaY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const handlePointerOver = (event: PointerEvent) => {
    const target = toElement(event.target);
    if (!target || isPanExcludedTarget(target)) return;
    const scroller = findClippedScrollable(target);
    if (!scroller) return;
    setPanCursor(scroller, 'grab');
    if (dragHint && !dragHintConsumed) positionDragHint(dragHint, scroller);
  };
  const handlePointerOut = (event: PointerEvent) => {
    if (panSession) return;
    const target = toElement(event.target);
    if (!target) return;
    const scroller = findClippedScrollable(target);
    if (scroller && !scroller.contains(event.relatedTarget as Node | null)) {
      restorePanCursor(scroller);
      if (dragHint) dragHint.style.display = 'none';
    }
  };
  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const target = toElement(event.target);
    if (!target || isPanExcludedTarget(target)) return;
    const scroller = findClippedScrollable(target);
    if (!scroller) return;
    panSession = {
      dragging: false,
      pointerId: event.pointerId,
      scroller,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: scroller.scrollLeft,
      startScrollTop: scroller.scrollTop,
    };
  };
  const handlePointerMove = (event: PointerEvent) => {
    const session = panSession;
    if (!session || session.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - session.startClientX;
    const deltaY = event.clientY - session.startClientY;
    if (!session.dragging && Math.hypot(deltaX, deltaY) < PAN_THRESHOLD_PX) return;
    if (!session.dragging) {
      session.dragging = true;
      dragHintConsumed = true;
      if (dragHint) dragHint.style.display = 'none';
      setPanCursor(session.scroller, 'grabbing');
      session.scroller.ownerDocument.defaultView?.getSelection()?.removeAllRanges();
    }
    session.scroller.scrollLeft = session.startScrollLeft - deltaX;
    session.scroller.scrollTop = session.startScrollTop - deltaY;
    event.preventDefault();
    event.stopPropagation();
  };
  const finishPan = (event: PointerEvent) => {
    if (!panSession || panSession.pointerId !== event.pointerId) return;
    suppressNextClick = panSession.dragging;
    setPanCursor(panSession.scroller, 'grab');
    panSession = null;
  };
  const suppressDraggedClick = (event: MouseEvent) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  doc.addEventListener('wheel', handleWheel, { capture: true, passive: false });
  doc.addEventListener('pointerover', handlePointerOver, true);
  doc.addEventListener('pointerout', handlePointerOut, true);
  doc.addEventListener('pointerdown', handlePointerDown, true);
  doc.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
  doc.addEventListener('pointerup', finishPan, true);
  doc.addEventListener('pointercancel', finishPan, true);
  doc.addEventListener('click', suppressDraggedClick, true);
  return () => {
    doc.removeEventListener('wheel', handleWheel, true);
    doc.removeEventListener('pointerover', handlePointerOver, true);
    doc.removeEventListener('pointerout', handlePointerOut, true);
    doc.removeEventListener('pointerdown', handlePointerDown, true);
    doc.removeEventListener('pointermove', handlePointerMove, true);
    doc.removeEventListener('pointerup', finishPan, true);
    doc.removeEventListener('pointercancel', finishPan, true);
    doc.removeEventListener('click', suppressDraggedClick, true);
    dragHint?.remove();
    for (const scroller of [...cursorValues.keys()]) restorePanCursor(scroller);
  };
}
