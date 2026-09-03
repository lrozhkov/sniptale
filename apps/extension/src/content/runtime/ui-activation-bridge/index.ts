import { scheduleDeferredActivation } from './deferred';
import {
  createBridgedMouseEvent,
  isBridgedMouseEvent,
} from '../../platform/trusted-events/synthetic-mouse';
import {
  getEventPath,
  installEditableKeydownBridge,
  isPrimaryPointerEvent,
  resolveActivationTarget,
  resolveEditableTarget,
} from './targets';
import { isTrustedPointerEvent } from '../../platform/trusted-events';

const BRIDGED_POINTER_WINDOW_MS = 750;
const DOUBLE_POINTER_DISTANCE_PX = 5;
const DOUBLE_POINTER_WINDOW_MS = 500;
const installedRoots = new WeakSet<EventTarget>();

type EditableSelectionPoint = { node: Node; offset: number };

type PointerSelectionSession = {
  anchor: EditableSelectionPoint | number;
  pointerId: number;
  target: HTMLElement;
};

type RecentEditablePointerDown = {
  clientX: number;
  clientY: number;
  target: HTMLElement;
  timestamp: number;
};

function isRepeatedEditablePointerDown(
  previous: RecentEditablePointerDown | null,
  event: PointerEvent,
  target: HTMLElement
): boolean {
  if (!previous || previous.target !== target) return false;
  const elapsed = event.timeStamp - previous.timestamp;
  const distanceX = event.clientX - previous.clientX;
  const distanceY = event.clientY - previous.clientY;
  return (
    elapsed >= 0 &&
    elapsed <= DOUBLE_POINTER_WINDOW_MS &&
    distanceX * distanceX + distanceY * distanceY <=
      DOUBLE_POINTER_DISTANCE_PX * DOUBLE_POINTER_DISTANCE_PX
  );
}

function resolveContentEditablePoint(
  target: HTMLElement,
  x: number,
  y: number,
  root: ShadowRoot | HTMLElement
): EditableSelectionPoint | null {
  const documentWithCaret = target.ownerDocument as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
      options?: { shadowRoots: ShadowRoot[] }
    ) => { offset: number; offsetNode: Node } | null;
  };
  const shadowRoot = root instanceof ShadowRoot ? root : null;
  const position = documentWithCaret.caretPositionFromPoint?.(
    x,
    y,
    shadowRoot ? { shadowRoots: [shadowRoot] } : undefined
  );
  if (position && target.contains(position.offsetNode)) {
    return { node: position.offsetNode, offset: position.offset };
  }
  const range = target.ownerDocument.caretRangeFromPoint?.(x, y);
  return range && target.contains(range.startContainer)
    ? { node: range.startContainer, offset: range.startOffset }
    : null;
}

const MIRRORED_STYLE_PROPERTIES = [
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
  'borderTopWidth',
  'boxSizing',
  'direction',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'tabSize',
  'textAlign',
  'textIndent',
  'textRendering',
  'textTransform',
  'wordBreak',
  'wordSpacing',
] as const;

function createTextControlMirror(target: HTMLInputElement | HTMLTextAreaElement): HTMLDivElement {
  const mirror = target.ownerDocument.createElement('div');
  const sourceStyle = target.ownerDocument.defaultView?.getComputedStyle(target);
  const rect = target.getBoundingClientRect();
  mirror.setAttribute('aria-hidden', 'true');
  Object.assign(mirror.style, {
    all: 'initial',
    display: 'block',
    left: `${rect.left - target.scrollLeft}px`,
    overflow: 'hidden',
    overflowWrap: 'break-word',
    pointerEvents: 'none',
    position: 'fixed',
    top: `${rect.top - target.scrollTop}px`,
    visibility: 'hidden',
    whiteSpace: target instanceof HTMLInputElement || target.wrap === 'off' ? 'pre' : 'pre-wrap',
    width: `${rect.width}px`,
    zIndex: '-1',
  });
  if (sourceStyle) {
    for (const property of MIRRORED_STYLE_PROPERTIES) {
      mirror.style[property] = sourceStyle[property];
    }
  }
  const root = target.getRootNode();
  if (root instanceof ShadowRoot) root.append(mirror);
  else target.ownerDocument.body.append(mirror);
  return mirror;
}

function compareMarkerToPoint(rect: DOMRect, x: number, y: number): number {
  if (rect.bottom <= y) return -1;
  if (rect.top > y) return 1;
  return rect.left <= x ? -1 : 1;
}

function resolveTextControlOffsetAtPoint(
  target: HTMLInputElement | HTMLTextAreaElement,
  x: number,
  y: number
): number {
  const mirror = createTextControlMirror(target);
  const prefix = target.ownerDocument.createTextNode('');
  const marker = target.ownerDocument.createElement('span');
  marker.textContent = '\u200b';
  Object.assign(marker.style, {
    all: 'initial',
    border: '0',
    display: 'inline',
    font: 'inherit',
    margin: '0',
    padding: '0',
    transform: 'none',
  });
  mirror.append(prefix, marker);
  let low = 0;
  let high = target.value.length;
  try {
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      prefix.data = target.value.slice(0, middle);
      if (compareMarkerToPoint(marker.getBoundingClientRect(), x, y) <= 0) low = middle;
      else high = middle - 1;
    }
    return low;
  } finally {
    mirror.remove();
  }
}

function resolveSelectionPoint(
  target: HTMLElement,
  event: PointerEvent,
  root: ShadowRoot | HTMLElement
): EditableSelectionPoint | number | null {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    if (target.selectionStart === null || target.selectionEnd === null) return null;
    return resolveTextControlOffsetAtPoint(target, event.clientX, event.clientY);
  }
  if (!target.matches('[contenteditable]:not([contenteditable="false"])')) return null;
  return resolveContentEditablePoint(target, event.clientX, event.clientY, root);
}

function applyPointerSelection(
  target: HTMLElement,
  anchor: EditableSelectionPoint | number,
  focus: EditableSelectionPoint | number
): void {
  if (
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
    typeof anchor === 'number' &&
    typeof focus === 'number'
  ) {
    target.setSelectionRange(
      Math.min(anchor, focus),
      Math.max(anchor, focus),
      focus < anchor ? 'backward' : 'forward'
    );
    return;
  }
  if (typeof anchor === 'number' || typeof focus === 'number') return;
  const selection = target.ownerDocument.getSelection();
  if (!selection) return;
  if (selection.setBaseAndExtent) {
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
    return;
  }
  const range = target.ownerDocument.createRange();
  if (
    anchor.node === focus.node &&
    typeof (anchor.node as CharacterData).length === 'number' &&
    anchor.offset > focus.offset
  ) {
    range.setStart(focus.node, focus.offset);
    range.setEnd(anchor.node, anchor.offset);
  } else {
    range.setStart(anchor.node, anchor.offset);
    range.setEnd(focus.node, focus.offset);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function isWordCharacter(value: string): boolean {
  return /^[\p{L}\p{N}_]$/u.test(value);
}

function resolveWordBounds(value: string, offset: number): { end: number; start: number } {
  let start = Math.min(offset, value.length);
  let end = start;
  if (
    !isWordCharacter(value[start] ?? '') &&
    start > 0 &&
    isWordCharacter(value[start - 1] ?? '')
  ) {
    start -= 1;
    end = start + 1;
  }
  while (start > 0 && isWordCharacter(value[start - 1] ?? '')) start -= 1;
  while (end < value.length && isWordCharacter(value[end] ?? '')) end += 1;
  return { end, start };
}

function applyPointerWordSelection(
  target: HTMLElement,
  point: EditableSelectionPoint | number
): void {
  if (
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
    typeof point === 'number'
  ) {
    const bounds = resolveWordBounds(target.value, point);
    target.setSelectionRange(bounds.start, bounds.end, 'forward');
    return;
  }
  if (typeof point === 'number' || !(point.node instanceof Text)) return;
  const bounds = resolveWordBounds(point.node.data, point.offset);
  const selection = target.ownerDocument.getSelection();
  if (!selection) return;
  const range = target.ownerDocument.createRange();
  range.setStart(point.node, bounds.start);
  range.setEnd(point.node, bounds.end);
  selection.removeAllRanges();
  selection.addRange(range);
}

function installEditablePointerSelectionBridge(root: ShadowRoot | HTMLElement): () => void {
  let recentPointerDown: RecentEditablePointerDown | null = null;
  let session: PointerSelectionSession | null = null;
  const handlePointerDown = (event: PointerEvent) => {
    if (
      event.button !== 0 ||
      !isTrustedPointerEvent(event) ||
      !getEventPath(event).includes(root)
    ) {
      return;
    }
    const target = resolveEditableTarget(event, root);
    if (!target || target.matches(':disabled')) return;
    const point = resolveSelectionPoint(target, event, root);
    if (point === null) return;
    event.preventDefault();
    event.stopPropagation();
    target.focus({ preventScroll: true });
    const isDoublePointerDown = isRepeatedEditablePointerDown(recentPointerDown, event, target);
    recentPointerDown = isDoublePointerDown
      ? null
      : {
          clientX: event.clientX,
          clientY: event.clientY,
          target,
          timestamp: event.timeStamp,
        };
    if (isDoublePointerDown) {
      session = null;
      applyPointerWordSelection(target, point);
      return;
    }
    const anchor = event.shiftKey
      ? target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        ? ((target.selectionDirection === 'backward'
            ? target.selectionEnd
            : target.selectionStart) ?? point)
        : point
      : point;
    session = { anchor, pointerId: event.pointerId, target };
    applyPointerSelection(target, anchor, point);
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (!session || session.pointerId !== event.pointerId) return;
    const point = resolveSelectionPoint(session.target, event, root);
    if (point === null) return;
    event.preventDefault();
    applyPointerSelection(session.target, session.anchor, point);
  };
  const clearSession = (event: PointerEvent) => {
    if (session?.pointerId === event.pointerId) session = null;
  };
  const pointerDownListener = handlePointerDown as EventListener;
  window.addEventListener('pointerdown', pointerDownListener, { capture: true });
  window.addEventListener('pointermove', handlePointerMove, { capture: true });
  window.addEventListener('pointerup', clearSession, { capture: true });
  window.addEventListener('pointercancel', clearSession, { capture: true });
  return () => {
    window.removeEventListener('pointerdown', pointerDownListener, { capture: true });
    window.removeEventListener('pointermove', handlePointerMove, { capture: true });
    window.removeEventListener('pointerup', clearSession, { capture: true });
    window.removeEventListener('pointercancel', clearSession, { capture: true });
  };
}

type BridgedActivation = {
  target: Element;
  timestamp: number;
};

function dispatchSyntheticActivation(target: Element, event: PointerEvent): void {
  const shouldApplyFocus = target.dispatchEvent(createBridgedMouseEvent('mousedown', event));
  if (shouldApplyFocus && target instanceof HTMLElement && target.tabIndex >= 0) {
    target.focus({ preventScroll: true });
  }
  target.dispatchEvent(createBridgedMouseEvent('click', event));
}

function shouldSuppressFollowUpEvent(
  event: Event,
  bridgedActivation: BridgedActivation | null
): boolean {
  if (!bridgedActivation || isBridgedMouseEvent(event)) {
    return false;
  }

  return (
    performance.now() - bridgedActivation.timestamp <= BRIDGED_POINTER_WINDOW_MS &&
    getEventPath(event).includes(bridgedActivation.target)
  );
}

function focusEditablePointerTarget(event: PointerEvent, root: ShadowRoot | HTMLElement): void {
  const editableTarget = resolveEditableTarget(event, root);
  if (!editableTarget || editableTarget.matches(':disabled')) {
    return;
  }

  editableTarget.focus({ preventScroll: true });
}

function handleActivationPointerDown(params: {
  event: PointerEvent;
  recordActivation: (target: Element) => void;
  root: ShadowRoot | HTMLElement;
}): void {
  const { event, recordActivation, root } = params;
  const activationTarget = resolveActivationTarget(event, root);
  if (!activationTarget) {
    return;
  }

  if (activationTarget.mode === 'defer') {
    scheduleDeferredActivation({
      dispatchActivation: dispatchSyntheticActivation,
      event,
      isBridgedEvent: isBridgedMouseEvent,
      root,
      target: activationTarget.element,
      onActivate: recordActivation,
    });
    return;
  }

  recordActivation(activationTarget.element);
  dispatchSyntheticActivation(activationTarget.element, event);
}

function installFollowUpSuppressors(
  root: ShadowRoot | HTMLElement,
  getBridgedActivation: () => BridgedActivation | null
): void {
  for (const eventType of ['mousedown', 'click'] as const) {
    root.addEventListener(
      eventType,
      (event) => {
        if (!shouldSuppressFollowUpEvent(event, getBridgedActivation())) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { capture: true }
    );
  }
}

/**
 * Host pages can cancel mousedown/click at window capture before content-owned React handlers run.
 * This bridge converts primary pointerdown on Sniptale-owned controls into local shadow-tree
 * mousedown/click events, while suppressing only the duplicate native follow-up events.
 */
export function installContentUiActivationBridge(root: ShadowRoot | HTMLElement): () => void {
  if (installedRoots.has(root)) {
    return () => undefined;
  }
  installedRoots.add(root);
  const disposeEditableKeydownBridge = installEditableKeydownBridge(root);
  const disposeEditablePointerSelectionBridge = installEditablePointerSelectionBridge(root);

  let bridgedActivation: BridgedActivation | null = null;

  root.addEventListener(
    'pointerdown',
    (event) => {
      if (!isTrustedPointerEvent(event) || !isPrimaryPointerEvent(event)) {
        return;
      }

      focusEditablePointerTarget(event, root);
      handleActivationPointerDown({
        event,
        root,
        recordActivation: (target) => {
          bridgedActivation = {
            target,
            timestamp: performance.now(),
          };
        },
      });
    },
    { capture: true }
  );

  installFollowUpSuppressors(root, () => bridgedActivation);
  return () => {
    disposeEditableKeydownBridge();
    disposeEditablePointerSelectionBridge();
  };
}
