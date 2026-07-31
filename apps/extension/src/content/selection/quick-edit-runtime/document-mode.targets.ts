import { isContentOwnedElement } from '../../platform/dom-host';

export type QuickEditDocumentModeEditTarget = EventTarget | Node | null;

const IGNORED_DOCUMENT_MODE_ROOT_SELECTOR = [
  '#sniptale-extension-root',
  '#sniptale-extension-root *',
  '.sniptale-quick-edit-hover',
  '.sniptale-quick-edit-hover *',
  '.sniptale-quick-edit-blocking-overlay',
  '.sniptale-quick-edit-blocking-overlay *',
  '.sniptale-quick-edit-active-frame',
  '.sniptale-quick-edit-active-frame *',
].join(', ');
const STABLE_TEXT_CONTAINER_SELECTOR = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'td',
  'th',
  'article',
  'section',
  'div',
].join(', ');
const DOCUMENT_NODE_TYPE = 9;
const ELEMENT_NODE_TYPE = 1;

function isDomNode(target: QuickEditDocumentModeEditTarget): target is Node {
  return Boolean(
    target &&
    typeof target === 'object' &&
    'nodeType' in target &&
    typeof target.nodeType === 'number'
  );
}

function isHtmlElement(node: Node): node is HTMLElement {
  if (node.nodeType !== ELEMENT_NODE_TYPE) {
    return false;
  }
  const constructor = node.ownerDocument?.defaultView?.HTMLElement;
  return constructor ? node instanceof constructor : node instanceof HTMLElement;
}

export function isIgnoredDocumentModeTarget(node: QuickEditDocumentModeEditTarget): boolean {
  const element = toElement(node);
  if (!element) {
    return false;
  }

  return (
    isContentOwnedElement(element) || Boolean(element.closest(IGNORED_DOCUMENT_MODE_ROOT_SELECTOR))
  );
}

export function resolveDocumentModeEditRoot(
  target: QuickEditDocumentModeEditTarget
): HTMLElement | null {
  if (isIgnoredDocumentModeTarget(target)) {
    return null;
  }

  const ownerDocument = resolveOwnerDocument(target);
  const selection = ownerDocument.getSelection();
  const candidateNodes = [
    isDomNode(target) ? target : null,
    selection?.anchorNode ?? null,
    ownerDocument.activeElement,
  ];

  for (const candidateNode of candidateNodes) {
    const root = resolveStableTextRoot(candidateNode);
    if (root?.isConnected && !isIgnoredDocumentModeTarget(root)) {
      return root;
    }
  }

  return resolveBodyFallback(ownerDocument);
}

function toElement(node: QuickEditDocumentModeEditTarget): HTMLElement | null {
  if (!isDomNode(node)) {
    return null;
  }
  if (isHtmlElement(node)) {
    return node;
  }

  return node.parentElement;
}

function resolveStableTextRoot(node: QuickEditDocumentModeEditTarget): HTMLElement | null {
  const element = toElement(node);
  if (!element || isIgnoredDocumentModeTarget(element)) {
    return null;
  }

  return element.closest<HTMLElement>(STABLE_TEXT_CONTAINER_SELECTOR);
}

function resolveBodyFallback(ownerDocument: Document): HTMLElement | null {
  const body = ownerDocument.body;
  if (!body?.isConnected || isIgnoredDocumentModeTarget(body)) {
    return null;
  }

  return body;
}

function resolveOwnerDocument(target: QuickEditDocumentModeEditTarget): Document {
  if (isDomNode(target)) {
    if (target.nodeType === DOCUMENT_NODE_TYPE) {
      return target as Document;
    }
    return target.ownerDocument ?? document;
  }

  return document;
}
