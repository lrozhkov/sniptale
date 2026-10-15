const itemAttribute = 'data-review-removal-key';

/** Keeps only inert visual copies after React removes a plate; never delays an edit. */
export function observeReviewRemovalMotion(viewport: HTMLElement): () => void {
  const outgoing = new Map<string, { node: HTMLElement; animation: Animation }>();
  const clear = (key: string) => {
    const entry = outgoing.get(key);
    if (!entry) return;
    outgoing.delete(key);
    entry.animation.onfinish = null;
    entry.animation.cancel();
    entry.node.remove();
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const key = node.getAttribute(itemAttribute);
        if (key) clear(key);
      }
    }
    for (const record of records) {
      const parent = record.target;
      if (!(parent instanceof HTMLElement) || !viewport.contains(parent)) continue;
      for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement) || node.isConnected) continue;
        const key = node.getAttribute(itemAttribute);
        if (!key || !node.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
          continue;
        if ([...parent.children].some((child) => child.getAttribute(itemAttribute) === key))
          continue;
        clear(key);
        const copy = createRemovalCopy(node);
        if (!copy) continue;
        copy.inert = true;
        copy.setAttribute('aria-hidden', 'true');
        copy.dataset['reviewRemoving'] = '';
        copy.style.pointerEvents = 'none';
        parent.append(copy);
        const animation = copy.animate(
          [
            { opacity: 1, scale: '1' },
            { opacity: 0, scale: '0.97 0.85' },
          ],
          { duration: 140, easing: 'ease-out', fill: 'forwards' }
        );
        outgoing.set(key, { node: copy, animation });
        animation.onfinish = () => clear(key);
      }
    }
  });
  observer.observe(viewport, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    for (const key of outgoing.keys()) clear(key);
  };
}

/** Removes DOM identities from a decorative copy while preserving its visual state. */
function createRemovalCopy(node: HTMLElement): HTMLElement | null {
  const copy = node.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return null;
  for (const element of [copy, ...copy.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      if (
        ['id', 'role', 'tabindex', 'data-ui', itemAttribute].includes(attribute.name) ||
        (attribute.name.startsWith('data-') && attribute.name.endsWith('-id'))
      )
        element.removeAttribute(attribute.name);
    }
  }
  return copy;
}
