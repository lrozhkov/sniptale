function findElementByIdInShadowRoot(root: ShadowRoot, id: string): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('[id]'));
  return candidates.find((element) => element.id === id) ?? null;
}

export function findElementByIdInLabelRoot(
  labelEl: HTMLLabelElement,
  id: string
): HTMLElement | null {
  const root = labelEl.getRootNode();
  if (root instanceof ShadowRoot) {
    return findElementByIdInShadowRoot(root, id);
  }

  return (labelEl.ownerDocument.getElementById(id) as HTMLElement | null) ?? null;
}
