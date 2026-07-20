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
    target instanceof Node ? target : null,
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
  if (node instanceof HTMLElement) {
    return node;
  }

  return node instanceof Node ? node.parentElement : null;
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
  if (target instanceof Document) {
    return target;
  }

  if (target instanceof Node) {
    return target.ownerDocument ?? document;
  }

  return document;
}
