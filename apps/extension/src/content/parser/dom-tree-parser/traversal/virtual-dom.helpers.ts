/**
 * Helpers for building a normalized virtual DOM without mutating the live page.
 */

export function buildVirtualNodeMappings(props: {
  virtualToOriginalMap: Map<Node, Node>;
  originalToVirtualMap: Map<Node, Node>;
  virtual: Node;
  original: Node;
}): void {
  props.virtualToOriginalMap.set(props.virtual, props.original);
  props.originalToVirtualMap.set(props.original, props.virtual);

  const virtualChildren = Array.from(props.virtual.childNodes);
  const originalChildren = Array.from(props.original.childNodes);
  for (
    let index = 0;
    index < virtualChildren.length && index < originalChildren.length;
    index += 1
  ) {
    const virtualChild = virtualChildren[index];
    const originalChild = originalChildren[index];
    if (virtualChild === undefined || originalChild === undefined) {
      continue;
    }
    buildVirtualNodeMappings({
      virtualToOriginalMap: props.virtualToOriginalMap,
      originalToVirtualMap: props.originalToVirtualMap,
      virtual: virtualChild,
      original: originalChild,
    });
  }
}

export function flattenOpenShadowRoots(props: {
  root: ParentNode;
  virtualToOriginalMap: Map<Node, Node>;
  originalToVirtualMap: Map<Node, Node>;
}): void {
  Array.from(props.root.querySelectorAll<HTMLElement>('*')).forEach((host) => {
    if (!host.shadowRoot || host.closest('#sniptale-extension-root')) {
      return;
    }

    const virtualHost = props.originalToVirtualMap.get(host);
    if (!(virtualHost instanceof HTMLElement)) {
      return;
    }

    Array.from(host.shadowRoot.childNodes).forEach((shadowChild) => {
      const clonedChild = shadowChild.cloneNode(true);
      buildVirtualNodeMappings({
        virtualToOriginalMap: props.virtualToOriginalMap,
        originalToVirtualMap: props.originalToVirtualMap,
        virtual: clonedChild,
        original: shadowChild,
      });
      virtualHost.appendChild(clonedChild);
    });
  });
}

export function resolveStreamedVirtualContent(virtualBody: HTMLElement): void {
  const elementsById = new Map<string, HTMLElement>();
  virtualBody.querySelectorAll<HTMLElement>('[id]').forEach((element) => {
    elementsById.set(element.id, element);
  });

  virtualBody.querySelectorAll<HTMLTemplateElement>('template[id^="B:"]').forEach((template) => {
    const suffix = template.id.slice(2);
    const streamedContent = elementsById.get(`S:${suffix}`);
    if (!(streamedContent instanceof HTMLElement) || !streamedContent.hasChildNodes()) {
      return;
    }

    const fragment = virtualBody.ownerDocument.createDocumentFragment();
    while (streamedContent.firstChild) {
      fragment.appendChild(streamedContent.firstChild);
    }

    template.replaceWith(fragment);
    streamedContent.remove();
  });
}
