const NATIVE_AUTO_CONTROLS = 'a[href],area[href],button,input,select,option,summary';
const REPLACED_CONTENT = 'img,video,audio,canvas,iframe,object,embed,svg';

function textPositionAt(target: HTMLElement, x: number, y: number) {
  const doc = target.ownerDocument;
  const shadowRoots: ShadowRoot[] = [];
  for (
    let root = target.getRootNode();
    root instanceof ShadowRoot;
    root = root.host.getRootNode()
  ) {
    shadowRoots.push(root);
  }
  const caret = doc.caretPositionFromPoint?.(x, y, { shadowRoots });
  if (caret?.offsetNode instanceof Text) return { node: caret.offsetNode, offset: caret.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range?.startContainer instanceof Text
    ? { node: range.startContainer, offset: range.startOffset }
    : null;
}

function hitsSelectableText(target: HTMLElement, x: number, y: number): boolean {
  const position = textPositionAt(target, x, y);
  if (!position || !target.contains(position.node)) return false;
  const { node, offset } = position;
  if (!node.length) return false;
  // Caret APIs return the nearest insertion point even in padding. Test the
  // adjacent characters' individual line rects instead of the element's box.
  const range = target.ownerDocument.createRange();
  range.setStart(node, Math.max(0, offset - 1));
  range.setEnd(node, Math.min(node.length, offset + 1));
  return Array.from(range.getClientRects()).some(
    (rect) =>
      rect.width > 0 &&
      rect.height > 0 &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
  );
}

/** Resolves the native horizontal text cursor, including cursor:auto glyph hits. */
export function isRecordingTextCursorTarget(
  target: HTMLElement,
  point: { clientX: number; clientY: number },
  cursor: string,
  selectingText: boolean
): boolean {
  if (cursor === 'text') return true;
  if (cursor !== 'auto') return false;
  if (selectingText) return true;
  if (target.isContentEditable) return true;
  if (target.closest(`${NATIVE_AUTO_CONTROLS},${REPLACED_CONTENT}`)) return false;
  if (getComputedStyle(target).userSelect === 'none') return false;
  return hitsSelectableText(target, point.clientX, point.clientY);
}
