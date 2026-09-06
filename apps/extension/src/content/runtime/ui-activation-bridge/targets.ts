import { isTrustedDomEvent } from '../../platform/trusted-events';

const ACTIVATABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input[type="button"]:not([disabled])',
  'input[type="checkbox"]:not([disabled])',
  'input[type="radio"]:not([disabled])',
  'input[type="submit"]:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="menuitem"]:not([aria-disabled="true"])',
  '[data-sniptale-activation-bridge="immediate"]',
  '[data-sniptale-activation-bridge="defer"]',
].join(',');

const BRIDGE_OPT_OUT_SELECTOR = [
  '[data-sniptale-activation-bridge="off"]',
  '.sniptale-drag-handle',
  '[data-ui="shared.ui.content-toolbar-drag-handle"]',
].join(',');

const EDITABLE_SELECTOR = [
  'input:not([type])',
  'input[type="email"]',
  'input[type="number"]',
  'input[type="password"]',
  'input[type="search"]',
  'input[type="tel"]',
  'input[type="text"]',
  'input[type="url"]',
  'select',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

type ActivationBridgeMode = 'immediate' | 'defer';

type ActivationTarget = {
  element: Element;
  mode: ActivationBridgeMode;
};

export function getEventPath(event: Event): EventTarget[] {
  return typeof event.composedPath === 'function' ? event.composedPath() : [];
}

export function isPrimaryPointerEvent(event: Event): event is PointerEvent {
  if (typeof PointerEvent !== 'undefined' && event instanceof PointerEvent) {
    return event.button === 0 && !event.defaultPrevented;
  }

  return (
    event.type === 'pointerdown' &&
    'button' in event &&
    (event as MouseEvent).button === 0 &&
    !event.defaultPrevented
  );
}

function isEditableTarget(element: Element): boolean {
  return Boolean(element.closest(EDITABLE_SELECTOR));
}

function resolveActivationMode(element: Element): ActivationBridgeMode {
  return element.closest('[data-sniptale-activation-bridge="defer"]') ? 'defer' : 'immediate';
}

export function resolveActivationTarget(event: Event, root: EventTarget): ActivationTarget | null {
  for (const target of getEventPath(event)) {
    if (target === root) {
      return null;
    }
    if (!(target instanceof Element)) {
      continue;
    }
    if (target.closest(BRIDGE_OPT_OUT_SELECTOR) || isEditableTarget(target)) {
      return null;
    }
    if (target.matches(ACTIVATABLE_SELECTOR)) {
      return { element: target, mode: resolveActivationMode(target) };
    }
  }

  return null;
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

export function resolveTextControlOffsetAtPoint(
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
      prefix.textContent = target.value.slice(0, middle);
      if (compareMarkerToPoint(marker.getBoundingClientRect(), x, y) <= 0) low = middle;
      else high = middle - 1;
    }
    return low;
  } finally {
    mirror.remove();
  }
}

function createLocalKeydown(event: KeyboardEvent): Event {
  const localEvent = new Event('keydown', { bubbles: true, cancelable: true, composed: false });
  Object.defineProperties(localEvent, {
    altKey: { value: event.altKey },
    code: { value: event.code },
    ctrlKey: { value: event.ctrlKey },
    isComposing: { value: event.isComposing },
    key: { value: event.key },
    metaKey: { value: event.metaKey },
    repeat: { value: event.repeat },
    shiftKey: { value: event.shiftKey },
  });
  return localEvent;
}

function resolveTextControlEdit(
  event: KeyboardEvent,
  target: HTMLInputElement | HTMLTextAreaElement
) {
  if (
    target.disabled ||
    target.readOnly ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  ) {
    return null;
  }
  const start = target.selectionStart;
  const end = target.selectionEnd;
  if (start === null || end === null) return null;
  if (event.key.length === 1) return { data: event.key, end, start };
  if (event.key === 'Enter' && target instanceof HTMLTextAreaElement) {
    return { data: '\n', end, start };
  }
  if (event.key === 'Backspace') {
    return { data: '', end, start: start === end ? Math.max(0, start - 1) : start };
  }
  if (event.key === 'Delete') {
    return { data: '', end: start === end ? Math.min(target.value.length, end + 1) : end, start };
  }
  return null;
}

function applyControlledTextEdit(event: KeyboardEvent, target: HTMLElement): boolean {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
  const edit = resolveTextControlEdit(event, target);
  if (!edit) return false;

  const value = `${target.value.slice(0, edit.start)}${edit.data}${target.value.slice(edit.end)}`;
  if (edit.data.length > 0 && target.maxLength >= 0 && value.length > target.maxLength) {
    return false;
  }
  const selection = edit.start + edit.data.length;
  const prototype =
    target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!nativeSetter) return false;
  nativeSetter.call(target, value);
  target.setSelectionRange(selection, selection);
  target.dispatchEvent(new Event('input', { bubbles: true, composed: false }));
  return true;
}

function getTextControlSelectionFocus(target: HTMLInputElement | HTMLTextAreaElement): {
  anchor: number;
  focus: number;
} | null {
  const start = target.selectionStart;
  const end = target.selectionEnd;
  if (start === null || end === null) return null;
  return target.selectionDirection === 'backward'
    ? { anchor: end, focus: start }
    : { anchor: start, focus: end };
}

function resolveVerticalTextControlFocus(
  target: HTMLInputElement | HTMLTextAreaElement,
  focus: number,
  direction: -1 | 1
): number {
  if (target instanceof HTMLTextAreaElement) {
    const mirror = createTextControlMirror(target);
    const prefix = target.ownerDocument.createTextNode(target.value.slice(0, focus));
    const marker = target.ownerDocument.createElement('span');
    marker.textContent = '\u200b';
    mirror.append(prefix, marker);
    const rect = marker.getBoundingClientRect();
    const style = target.ownerDocument.defaultView?.getComputedStyle(target);
    const lineHeight = Number.parseFloat(style?.lineHeight ?? '') || rect.height || 16;
    const point = {
      x: rect.left + 1,
      y: rect.top + rect.height / 2 + direction * lineHeight,
    };
    mirror.remove();
    return resolveTextControlOffsetAtPoint(target, point.x, point.y);
  }

  const value = target.value;
  const lineStart = value.lastIndexOf('\n', Math.max(0, focus - 1)) + 1;
  const column = focus - lineStart;
  if (direction < 0) {
    if (lineStart === 0) return focus;
    const previousEnd = lineStart - 1;
    const previousStart = value.lastIndexOf('\n', Math.max(0, previousEnd - 1)) + 1;
    return Math.min(previousStart + column, previousEnd);
  }
  const lineEnd = value.indexOf('\n', focus);
  if (lineEnd < 0) return focus;
  const nextStart = lineEnd + 1;
  const nextEnd = value.indexOf('\n', nextStart);
  return Math.min(nextStart + column, nextEnd < 0 ? value.length : nextEnd);
}

function resolveTextControlNavigationFocus(
  event: KeyboardEvent,
  target: HTMLInputElement | HTMLTextAreaElement,
  focus: number
): number | null {
  switch (event.key) {
    case 'ArrowLeft':
      return Math.max(0, focus - 1);
    case 'ArrowRight':
      return Math.min(target.value.length, focus + 1);
    case 'ArrowUp':
      return resolveVerticalTextControlFocus(target, focus, -1);
    case 'ArrowDown':
      return resolveVerticalTextControlFocus(target, focus, 1);
    case 'Home':
      return target.value.lastIndexOf('\n', Math.max(0, focus - 1)) + 1;
    case 'End': {
      const lineEnd = target.value.indexOf('\n', focus);
      return lineEnd < 0 ? target.value.length : lineEnd;
    }
    default:
      return null;
  }
}

function applyTextControlNavigation(event: KeyboardEvent, target: HTMLElement): boolean {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
  const selection = getTextControlSelectionFocus(target);
  if (!selection) return false;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    target.setSelectionRange(0, target.value.length, 'forward');
    return true;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const nextFocus = resolveTextControlNavigationFocus(event, target, selection.focus);
  if (nextFocus === null) return false;
  const anchor = event.shiftKey ? selection.anchor : nextFocus;
  target.setSelectionRange(
    Math.min(anchor, nextFocus),
    Math.max(anchor, nextFocus),
    nextFocus < anchor ? 'backward' : 'forward'
  );
  return true;
}

function applyContentEditableNavigation(event: KeyboardEvent, target: HTMLElement): boolean {
  if (!target.matches('[contenteditable]:not([contenteditable="false"])')) return false;
  const selection = target.ownerDocument.getSelection() as
    | (Selection & {
        modify?: (
          alteration: 'extend' | 'move',
          direction: 'backward' | 'forward',
          granularity: 'character' | 'line' | 'lineboundary'
        ) => void;
      })
    | null;
  if (!selection) return false;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    const range = target.ownerDocument.createRange();
    range.selectNodeContents(target);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || !selection.modify) return false;
  const movement = {
    ArrowDown: ['forward', 'line'],
    ArrowLeft: ['backward', 'character'],
    ArrowRight: ['forward', 'character'],
    ArrowUp: ['backward', 'line'],
    End: ['forward', 'lineboundary'],
    Home: ['backward', 'lineboundary'],
  }[event.key] as ['backward' | 'forward', 'character' | 'line' | 'lineboundary'] | undefined;
  if (!movement) return false;
  selection.modify(event.shiftKey ? 'extend' : 'move', movement[0], movement[1]);
  return true;
}

function resolveTextBoundaryNode(node: Node | undefined, direction: 'backward' | 'forward') {
  let current = node;
  while (current && !(current instanceof Text)) {
    current =
      direction === 'backward'
        ? (current.lastChild ?? undefined)
        : (current.firstChild ?? undefined);
  }
  return current instanceof Text ? current : null;
}

function expandCollapsedContentEditableRange(
  range: Range,
  direction: 'backward' | 'forward'
): boolean {
  const container = range.startContainer;
  const offset = range.startOffset;
  if (container instanceof Text) {
    if (direction === 'backward' && offset > 0) {
      range.setStart(container, offset - 1);
      return true;
    }
    if (direction === 'forward' && offset < container.length) {
      range.setEnd(container, offset + 1);
      return true;
    }
  }
  if (!(container instanceof Element)) return false;
  const textNode = resolveTextBoundaryNode(
    container.childNodes[direction === 'backward' ? offset - 1 : offset],
    direction
  );
  if (!textNode || textNode.length === 0) return false;
  if (direction === 'backward') {
    range.setStart(textNode, textNode.length - 1);
  } else {
    range.setEnd(textNode, 1);
  }
  return true;
}

function applyContentEditableTextEdit(event: KeyboardEvent, target: HTMLElement): boolean {
  const isDeletion = event.key === 'Backspace' || event.key === 'Delete';
  if (
    !target.matches('[contenteditable]:not([contenteditable="false"])') ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    (event.key.length !== 1 && !isDeletion)
  ) {
    return false;
  }

  const selection = target.ownerDocument.getSelection();
  if (!selection) return false;
  let range =
    selection.rangeCount > 0 && target.contains(selection.getRangeAt(0).commonAncestorContainer)
      ? selection.getRangeAt(0)
      : target.ownerDocument.createRange();
  if (selection.rangeCount === 0 || !target.contains(range.commonAncestorContainer)) {
    range.selectNodeContents(target);
    range.collapse(false);
  }

  if (isDeletion) {
    if (range.collapsed) {
      const selectionWithModify = selection as Selection & {
        modify?: (
          alteration: 'extend',
          direction: 'backward' | 'forward',
          granularity: 'character'
        ) => void;
      };
      const direction = event.key === 'Backspace' ? 'backward' : 'forward';
      if (!expandCollapsedContentEditableRange(range, direction) && selectionWithModify.modify) {
        selectionWithModify.modify('extend', direction, 'character');
        if (selection.rangeCount > 0) range = selection.getRangeAt(0);
      }
    }
    range.deleteContents();
    range.collapse(true);
  } else {
    range.deleteContents();
    const textNode = target.ownerDocument.createTextNode(event.key);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(range);
  target.dispatchEvent(new Event('input', { bubbles: true, composed: false }));
  return true;
}

export function installEditableKeydownBridge(root: ShadowRoot | HTMLElement): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isTrustedDomEvent(event) || !getEventPath(event).includes(root)) return;
    const target = resolveEditableTarget(event, root);
    if (!target) return;

    const hostPreventedDefault = event.defaultPrevented;
    event.stopPropagation();
    const accepted = target.dispatchEvent(createLocalKeydown(event));
    if (!accepted) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!hostPreventedDefault || event.isComposing) return;
    if (
      applyControlledTextEdit(event, target) ||
      applyContentEditableTextEdit(event, target) ||
      applyTextControlNavigation(event, target) ||
      applyContentEditableNavigation(event, target)
    ) {
      event.preventDefault();
    }
  };
  window.addEventListener('keydown', handleKeyDown, { capture: true });
  return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
}

export function resolveEditableTarget(event: Event, root: EventTarget): HTMLElement | null {
  for (const target of getEventPath(event)) {
    if (target === root) {
      return null;
    }
    if (target instanceof HTMLElement) {
      const editableTarget = target.closest(EDITABLE_SELECTOR);
      if (editableTarget instanceof HTMLElement) {
        return editableTarget;
      }
    }
  }

  return null;
}
