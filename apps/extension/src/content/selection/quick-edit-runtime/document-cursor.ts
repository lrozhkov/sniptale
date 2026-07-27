import { addEventListenerToAllWindowsDynamic, walkAllDocuments } from '../../platform/frame';
import {
  QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS,
  QUICK_EDIT_TEXT_CURSOR_BODY_CLASS,
} from './style.constants';

const TEXT_CONTROL_SELECTOR = [
  'textarea',
  'input:not([type])',
  "input[type='email']",
  "input[type='number']",
  "input[type='password']",
  "input[type='search']",
  "input[type='tel']",
  "input[type='text']",
  "input[type='url']",
  "[contenteditable='true']",
  "[contenteditable='plaintext-only']",
].join(',');
const REPLACED_CONTENT_SELECTOR = 'audio,canvas,embed,iframe,img,object,picture,svg,video';
const ELEMENT_NODE_TYPE = 1;
const TEXT_NODE_TYPE = 3;
const TEXT_RECT_TOLERANCE = 1;

interface TextPosition {
  node: Text;
  offset: number;
}

function resolveTextPosition(doc: Document, x: number, y: number): TextPosition | null {
  const caretPosition = doc.caretPositionFromPoint?.(x, y);
  if (caretPosition?.offsetNode.nodeType === TEXT_NODE_TYPE) {
    return { node: caretPosition.offsetNode as Text, offset: caretPosition.offset };
  }

  const caretRange = doc.caretRangeFromPoint?.(x, y);
  if (caretRange?.startContainer.nodeType !== TEXT_NODE_TYPE) {
    return null;
  }

  return { node: caretRange.startContainer as Text, offset: caretRange.startOffset };
}

function getTextOffsets(position: TextPosition): number[] {
  const length = position.node.data.length;
  if (length === 0) return [];

  const offsets = new Set<number>();
  if (position.offset < length) offsets.add(Math.max(0, position.offset));
  if (position.offset > 0) offsets.add(Math.min(length - 1, position.offset - 1));
  return Array.from(offsets);
}

function isPointInsideRect(
  rect: Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>,
  x: number,
  y: number
) {
  return (
    x >= rect.left - TEXT_RECT_TOLERANCE &&
    x <= rect.right + TEXT_RECT_TOLERANCE &&
    y >= rect.top - TEXT_RECT_TOLERANCE &&
    y <= rect.bottom + TEXT_RECT_TOLERANCE
  );
}

function isPointOverText(position: TextPosition, x: number, y: number): boolean {
  return getTextOffsets(position).some((offset) => {
    const range = position.node.ownerDocument.createRange();
    range.setStart(position.node, offset);
    range.setEnd(position.node, offset + 1);
    return Array.from(range.getClientRects()).some((rect) => isPointInsideRect(rect, x, y));
  });
}

function resolveEventTargetElement(target: EventTarget | null): Element | null {
  if (!target || !('nodeType' in target) || (target as Node).nodeType !== ELEMENT_NODE_TYPE) {
    return null;
  }

  return target as Element;
}

function shouldUseTextCursor(event: PointerEvent, target: Element): boolean {
  if (target.closest(REPLACED_CONTENT_SELECTOR)) return false;
  if (target.closest(TEXT_CONTROL_SELECTOR)) return true;

  const doc = target.ownerDocument;
  const position = resolveTextPosition(doc, event.clientX, event.clientY);
  return position ? isPointOverText(position, event.clientX, event.clientY) : false;
}

function updateDocumentCursor(event: PointerEvent): void {
  const target = resolveEventTargetElement(event.target);
  const body = target?.ownerDocument.body;
  if (!body) return;

  const useTextCursor =
    body.classList.contains(QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS) &&
    shouldUseTextCursor(event, target);
  body.classList.toggle(QUICK_EDIT_TEXT_CURSOR_BODY_CLASS, useTextCursor);
}

function clearDocumentTextCursorClasses(): void {
  walkAllDocuments((doc) => {
    doc.body?.classList.remove(QUICK_EDIT_TEXT_CURSOR_BODY_CLASS);
  });
}

/** Tracks whether the pointer is over an actual caret-bearing text rectangle. */
export function mountQuickEditDocumentCursorTracking(): () => void {
  const cleanupPointerListener = addEventListenerToAllWindowsDynamic<PointerEvent>(
    'pointermove',
    updateDocumentCursor,
    { capture: true, passive: true }
  );

  return () => {
    cleanupPointerListener();
    clearDocumentTextCursorClasses();
  };
}
