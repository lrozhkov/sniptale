export function shouldIgnoreIframeMutation(node: HTMLElement): boolean {
  return Boolean(
    node.closest?.('.sniptale-frames-container, .sniptale-highlight-container, .sniptale-app')
  );
}

export function collectIframeElements(rootNode: HTMLElement): HTMLIFrameElement[] {
  const iframeElements = rootNode instanceof HTMLIFrameElement ? [rootNode] : [];
  const nestedIframes = Array.from(rootNode.querySelectorAll('iframe')).filter(
    (node): node is HTMLIFrameElement => node instanceof HTMLIFrameElement
  );

  return [...iframeElements, ...nestedIframes];
}
