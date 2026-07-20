import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { buildVirtualDomSnapshot } from '../../../parser/dom-tree-parser/traversal';
import {
  resolveDiagnosticsDocument,
  type ExportDiagnosticsSource,
} from '../../../parser/export-manager/diagnostics/source';
import { sanitizeUrlAttributes } from './page-snapshot.url-attributes';

function buildScriptPlaceholder(script: HTMLScriptElement): string {
  const textLength = script.textContent?.trim().length ?? 0;
  const scriptType = script.getAttribute('type') ?? 'text/javascript';

  return `[script:${scriptType}:${textLength}]`;
}

function sanitizeTextAttributes(element: HTMLElement): void {
  ['alt', 'aria-description', 'aria-label', 'content', 'placeholder', 'title', 'value'].forEach(
    (attributeName) => {
      if (element.hasAttribute(attributeName)) {
        element.setAttribute(attributeName, '');
      }
    }
  );
}

function removeEventHandlerAttributes(element: HTMLElement): void {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name.toLowerCase().startsWith('on')) {
      element.removeAttribute(attribute.name);
    }
  }
}

function redactTextNodes(root: HTMLElement, documentRoot: Document): void {
  const nodeFilter = documentRoot.defaultView?.NodeFilter ?? NodeFilter;
  const walker = documentRoot.createTreeWalker(root, nodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textNode = currentNode as Text;
    const normalizedText = textNode.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    textNode.textContent = normalizedText.length > 0 ? `[text:${normalizedText.length}]` : '';
    currentNode = walker.nextNode();
  }
}

function redactDomSnapshot(root: HTMLElement, documentRoot: Document): void {
  root.querySelectorAll(`#${CONTENT_ROOT_ID}`).forEach((node) => node.remove());
  [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))].forEach((element) => {
    removeEventHandlerAttributes(element);
    sanitizeTextAttributes(element);
    sanitizeUrlAttributes(element);

    if (element instanceof HTMLScriptElement) {
      element.textContent = buildScriptPlaceholder(element);
      return;
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = '';
      element.setAttribute('value', '');
      return;
    }

    if (element instanceof HTMLOptionElement) {
      element.textContent = '';
      element.value = '';
    }
  });
  redactTextNodes(root, documentRoot);
}

function buildHtmlSnapshot(root: HTMLElement, documentRoot: Document): string {
  const doctype = documentRoot.doctype
    ? `<!DOCTYPE ${documentRoot.doctype.name}>`
    : '<!DOCTYPE html>';
  return `${doctype}\n${root.outerHTML}`;
}

export function buildDomSnapshotHtml(source?: ExportDiagnosticsSource): string {
  const documentRoot = resolveDiagnosticsDocument(source);
  const clone = documentRoot.documentElement.cloneNode(true) as HTMLElement;
  redactDomSnapshot(clone, documentRoot);
  return buildHtmlSnapshot(clone, documentRoot);
}

export function buildVirtualDomSnapshotHtml(source?: ExportDiagnosticsSource): string {
  const documentRoot = resolveDiagnosticsDocument(source);
  const clone = documentRoot.documentElement.cloneNode(true) as HTMLElement;
  const virtualBody = buildVirtualDomSnapshot({
    documentRoot,
    root: documentRoot.body ?? documentRoot.documentElement,
  }).root;
  const clonedBody = clone.querySelector('body');
  redactDomSnapshot(clone, documentRoot);

  if (clonedBody) {
    clonedBody.replaceWith(virtualBody);
  } else {
    clone.append(virtualBody);
  }

  redactDomSnapshot(clone, documentRoot);
  return buildHtmlSnapshot(clone, documentRoot);
}
