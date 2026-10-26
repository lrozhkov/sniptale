/** Reads the next rendered ancestor without crossing document or realm boundaries. */
export function getComposedParent(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode(),
    view = element.ownerDocument.defaultView;
  return view && root instanceof view.ShadowRoot ? root.host : null;
}
