import { getIframeDocument } from '../../../platform/frame';
import type { VirtualDomOriginalElementResolver } from '../../dom-tree-parser/traversal';
import {
  collectOpenShadowHosts,
  resolveStreamedVirtualContent,
} from '../../dom-tree-parser/traversal/virtual-dom.helpers';

interface InertVirtualDomSnapshot {
  document: Document;
  root: HTMLElement;
  resolveOriginalElement: VirtualDomOriginalElementResolver;
}

interface VirtualNodeMaps {
  originalToVirtual: Map<Node, Node>;
  virtualToOriginal: Map<Node, Node>;
}

function collectMappedChildren(node: Node): Node[] {
  if (node.nodeType === Node.ELEMENT_NODE && node.nodeName.toLowerCase() === 'template') {
    return Array.from((node as HTMLTemplateElement).content.childNodes);
  }
  return Array.from(node.childNodes);
}

function assertMatchingNodes(original: Node, virtual: Node): void {
  if (
    original.nodeType !== virtual.nodeType ||
    original.nodeName !== virtual.nodeName ||
    original.nodeValue !== virtual.nodeValue
  ) {
    throw new Error('Prepared snapshot structure changed while entering the inert document.');
  }
  if (original.nodeType !== Node.ELEMENT_NODE || virtual.nodeType !== Node.ELEMENT_NODE) return;
  const originalAttributes = Array.from((original as Element).attributes);
  const virtualAttributes = Array.from((virtual as Element).attributes);
  if (
    originalAttributes.length !== virtualAttributes.length ||
    originalAttributes.some((attribute, index) => {
      const virtualAttribute = virtualAttributes[index];
      return (
        !virtualAttribute ||
        attribute.name !== virtualAttribute.name ||
        attribute.namespaceURI !== virtualAttribute.namespaceURI ||
        attribute.value !== virtualAttribute.value
      );
    })
  ) {
    throw new Error('Prepared snapshot attributes changed while entering the inert document.');
  }
}

function mapMatchingSubtrees(original: Node, virtual: Node, maps: VirtualNodeMaps): void {
  assertMatchingNodes(original, virtual);
  maps.originalToVirtual.set(original, virtual);
  maps.virtualToOriginal.set(virtual, original);
  const originalChildren = collectMappedChildren(original);
  const virtualChildren = collectMappedChildren(virtual);
  if (originalChildren.length !== virtualChildren.length) {
    throw new Error('Prepared snapshot child structure changed while entering the inert document.');
  }
  for (const [index, originalChild] of originalChildren.entries()) {
    const virtualChild = virtualChildren[index];
    if (!virtualChild) throw new Error('Prepared snapshot child mapping is incomplete.');
    mapMatchingSubtrees(originalChild, virtualChild, maps);
  }
}

function importMappedSubtree<T extends Node>(
  original: T,
  inertDocument: Document,
  maps: VirtualNodeMaps
): T {
  const virtual = inertDocument.importNode(original, true) as T;
  mapMatchingSubtrees(original, virtual, maps);
  return virtual;
}

function appendInertShadowContents(
  originalRoot: HTMLElement,
  inertDocument: Document,
  maps: VirtualNodeMaps
): void {
  for (const host of collectOpenShadowHosts(originalRoot)) {
    const shadowRoot = host.shadowRoot;
    const virtualHost = maps.originalToVirtual.get(host);
    if (!shadowRoot || !virtualHost || virtualHost.nodeType !== Node.ELEMENT_NODE) continue;
    for (const originalChild of Array.from(shadowRoot.childNodes)) {
      virtualHost.appendChild(importMappedSubtree(originalChild, inertDocument, maps));
    }
  }
}

function annotateIframeContent(container: Element, iframeId: string): void {
  container.setAttribute('data-iframe-source', iframeId);
  for (const element of container.querySelectorAll('*')) {
    if (!element.hasAttribute('data-iframe-source')) {
      element.setAttribute('data-iframe-source', iframeId);
    }
  }
}

function createVirtualIframeContainer(
  inertDocument: Document,
  originalIframe: HTMLIFrameElement,
  iframeId: string
): HTMLElement {
  const container = inertDocument.createElement('div');
  container.setAttribute('data-virtual-iframe', 'true');
  container.id = iframeId;
  if (originalIframe.className) container.className = originalIframe.className;
  const inlineStyle = originalIframe.getAttribute('style');
  if (inlineStyle) container.setAttribute('style', inlineStyle);
  const width = originalIframe.getAttribute('width');
  const height = originalIframe.getAttribute('height');
  if (width && !container.style.width) container.style.width = normalizeIframeDimension(width);
  if (height && !container.style.height) container.style.height = normalizeIframeDimension(height);
  if (originalIframe.src) container.setAttribute('data-iframe-src', originalIframe.src);
  for (const name of ['data-application-code', 'data-origin']) {
    const value = originalIframe.getAttribute(name);
    if (value) container.setAttribute(name, value);
  }
  return container;
}

function normalizeIframeDimension(value: string): string {
  const normalized = value.trim();
  let dotSeen = false;
  let digitSeen = false;
  const isUnitlessNumber =
    normalized.length > 0 &&
    Array.from(normalized).every((character) => {
      if (character >= '0' && character <= '9') {
        digitSeen = true;
        return true;
      }
      if (character !== '.' || dotSeen) return false;
      dotSeen = true;
      return true;
    });
  return isUnitlessNumber && digitSeen ? `${normalized}px` : normalized;
}

function embedInertIframe(originalIframe: HTMLIFrameElement, maps: VirtualNodeMaps): void {
  const iframeId = originalIframe.id;
  const iframeDocument = getIframeDocument(originalIframe);
  const virtualIframe = maps.originalToVirtual.get(originalIframe);
  if (!iframeId || !iframeDocument?.body || !virtualIframe?.parentNode) return;

  const inertDocument = (virtualIframe as Element).ownerDocument;
  const inertBody = importMappedSubtree(iframeDocument.body, inertDocument, maps);
  const container = createVirtualIframeContainer(inertDocument, originalIframe, iframeId);
  maps.originalToVirtual.set(originalIframe, container);
  maps.virtualToOriginal.set(container, originalIframe);
  while (inertBody.firstChild) container.appendChild(inertBody.firstChild);
  annotateIframeContent(container, iframeId);
  virtualIframe.parentNode.replaceChild(container, virtualIframe);

  for (const nestedIframe of iframeDocument.body.querySelectorAll('iframe')) {
    embedInertIframe(nestedIframe, maps);
  }
}

function copyDocumentElementAttributes(sourceDocument: Document, inertDocument: Document): void {
  for (const attribute of Array.from(inertDocument.documentElement.attributes)) {
    inertDocument.documentElement.removeAttribute(attribute.name);
  }
  for (const attribute of Array.from(sourceDocument.documentElement.attributes)) {
    inertDocument.documentElement.setAttributeNS(
      attribute.namespaceURI,
      attribute.name,
      attribute.value
    );
  }
}

export function buildInertPreparedSnapshotVirtualDom(
  sourceDocument: Document,
  originalRoot: HTMLElement
): InertVirtualDomSnapshot {
  const inertDocument = new DOMParser().parseFromString(
    '<!doctype html><html><head></head><body></body></html>',
    'text/html'
  );
  const maps: VirtualNodeMaps = {
    originalToVirtual: new Map(),
    virtualToOriginal: new Map(),
  };
  const root = importMappedSubtree(originalRoot, inertDocument, maps);
  inertDocument.head.replaceWith(inertDocument.importNode(sourceDocument.head, true));
  if (originalRoot.tagName.toLowerCase() === 'body') {
    inertDocument.body.replaceWith(root);
  } else {
    const inertBody = inertDocument.importNode(sourceDocument.body, false);
    inertBody.appendChild(root);
    inertDocument.body.replaceWith(inertBody);
  }
  copyDocumentElementAttributes(sourceDocument, inertDocument);
  appendInertShadowContents(originalRoot, inertDocument, maps);
  resolveStreamedVirtualContent(root);
  for (const iframe of originalRoot.querySelectorAll('iframe')) embedInertIframe(iframe, maps);

  return {
    document: inertDocument,
    root,
    resolveOriginalElement: (virtualElement) => maps.virtualToOriginal.get(virtualElement) ?? null,
  };
}
