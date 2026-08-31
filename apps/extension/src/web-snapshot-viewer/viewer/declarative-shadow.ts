function collectDeclarativeShadowBoundaries(root: ParentNode): Element[] {
  const boundaries = Array.from(root.querySelectorAll('template[shadowrootmode="open"]'));
  for (const template of Array.from(root.querySelectorAll('template'))) {
    const content = (template as HTMLTemplateElement).content;
    if (content) boundaries.push(...collectDeclarativeShadowBoundaries(content));
  }
  return boundaries;
}

export function hydrateSnapshotDeclarativeShadowDom(targetDocument: Document | null): void {
  if (!targetDocument) return;
  const pending: ParentNode[] = [targetDocument];
  while (pending.length > 0) {
    const root = pending.shift();
    if (!root) continue;
    for (const boundary of collectDeclarativeShadowBoundaries(root)) {
      const host = boundary.parentElement;
      if (!host || host.shadowRoot || typeof host.attachShadow !== 'function') continue;
      const shadowRoot = host.attachShadow({ mode: 'open' });
      const content = (boundary as HTMLTemplateElement).content;
      if (content) shadowRoot.append(content);
      else shadowRoot.append(...Array.from(boundary.childNodes));
      boundary.remove();
      pending.push(shadowRoot);
    }
  }
}
