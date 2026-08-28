import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import {
  redactDiagnosticUrlSecrets,
  sanitizeRawDiagnosticExportData,
} from '@sniptale/platform/observability/diagnostics/sanitizer';
import { sanitizeWebSnapshotCssText } from '../../../../features/web-snapshot/public';
import { sanitizeDiagnosticUrlAttributeValue } from './page-snapshot.url-attributes';
import { estimateUtf8Bytes } from '@sniptale/runtime-contracts/validation/base64';
import { redactSensitiveString } from '@sniptale/platform/security/secret-redaction';

export const MAX_EXTENDED_DIAGNOSTIC_ELEMENTS = 100_000;
const MAX_EXTENDED_DIAGNOSTIC_HTML_BYTES = 32 * 1024 * 1024;
export const MAX_EXTENDED_DIAGNOSTIC_DOM_INPUT_BYTES = 32 * 1024 * 1024;
const MAX_EXTENDED_DIAGNOSTIC_REDACTIONS = 100_000;

const CONTROL_STATE_ATTRIBUTES = ['checked', 'selected', 'value'] as const;

export interface ExtendedDiagnosticRedaction {
  attribute: string | null;
  elementPath: string;
  kind: 'attribute' | 'content' | 'element';
  originalLength: number;
  reason:
    | 'executable-element'
    | 'extension-owned-element'
    | 'form-control-state'
    | 'inline-handler'
    | 'srcdoc'
    | 'stylesheet-body';
}

interface ExtendedDiagnosticDomProjection {
  elementCount: number;
  html: string;
  redactions: ExtendedDiagnosticRedaction[];
}

interface ExtendedDiagnosticDomAdmission {
  documentRoot: Document;
  elementCount: number;
  sourceRoot: Element;
}

function sanitizeScalar(key: string, value: string): string {
  const sanitized = sanitizeRawDiagnosticExportData({ [key]: value });
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return '';
  const result = (sanitized as Record<string, unknown>)[key];
  if (typeof result !== 'string') return '';
  if (value.length > 300 && result.endsWith('... [truncated]')) {
    return redactSensitiveString(value, value.length);
  }
  return result;
}

function elementPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && segments.length < 8) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.localName === current.localName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    segments.unshift(`${current.localName}:nth-of-type(${index})`);
    current = current.parentElement;
  }
  return segments.join(' > ');
}

function pushRedaction(
  redactions: ExtendedDiagnosticRedaction[],
  element: Element,
  reason: ExtendedDiagnosticRedaction['reason'],
  args: {
    attribute?: string;
    kind: ExtendedDiagnosticRedaction['kind'];
    originalLength?: number;
  }
): void {
  if (redactions.length >= MAX_EXTENDED_DIAGNOSTIC_REDACTIONS) {
    throw new Error('Extended diagnostic redactions exceed the entry limit.');
  }
  redactions.push({
    attribute: args.attribute ?? null,
    elementPath: elementPath(element),
    kind: args.kind,
    originalLength: args.originalLength ?? 0,
    reason,
  });
}

function sanitizeCssUrl(value: string, baseUrl: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return trimmed;
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return redactDiagnosticUrlSecrets(resolved.href) ?? null;
  } catch {
    return null;
  }
}

function sanitizeAttributeValue(element: Element, name: string, value: string): string {
  const normalizedName = name.toLowerCase();
  if (normalizedName === 'style') {
    const css = sanitizeWebSnapshotCssText(value, (url) =>
      sanitizeCssUrl(url, element.ownerDocument.baseURI)
    );
    return sanitizeScalar(normalizedName, css);
  }
  const sanitizedUrlValue = sanitizeDiagnosticUrlAttributeValue(
    normalizedName,
    value,
    redactDiagnosticUrlSecrets
  );
  if (sanitizedUrlValue !== null) return sanitizedUrlValue;
  return sanitizeScalar(normalizedName, value);
}

function redactAttributes(element: Element, redactions: ExtendedDiagnosticRedaction[]): void {
  for (const attribute of Array.from(element.attributes)) {
    const normalizedName = attribute.name.toLowerCase();
    if (normalizedName.startsWith('on')) {
      pushRedaction(redactions, element, 'inline-handler', {
        attribute: normalizedName,
        kind: 'attribute',
        originalLength: attribute.value.length,
      });
      element.removeAttribute(attribute.name);
      element.setAttribute(
        `data-sniptale-diagnostic-${normalizedName}`,
        `[handler omitted; length=${attribute.value.length}]`
      );
      continue;
    }
    if (normalizedName === 'srcdoc') {
      pushRedaction(redactions, element, 'srcdoc', {
        attribute: normalizedName,
        kind: 'attribute',
        originalLength: attribute.value.length,
      });
      element.removeAttribute(attribute.name);
      continue;
    }
    if (
      CONTROL_STATE_ATTRIBUTES.includes(normalizedName as (typeof CONTROL_STATE_ATTRIBUTES)[number])
    ) {
      pushRedaction(redactions, element, 'form-control-state', {
        attribute: normalizedName,
        kind: 'attribute',
        originalLength: attribute.value.length,
      });
      element.removeAttribute(attribute.name);
      continue;
    }
    const sanitizedValue = sanitizeAttributeValue(element, normalizedName, attribute.value);
    if (sanitizedValue !== attribute.value) {
      element.setAttribute(attribute.name, sanitizedValue);
    }
  }
}

function replaceExecutableElement(
  element: Element,
  redactions: ExtendedDiagnosticRedaction[]
): void {
  const replacement = element.ownerDocument.createElement('template');
  replacement.setAttribute('data-sniptale-diagnostic-placeholder', element.localName);
  replacement.setAttribute('data-sniptale-diagnostic-path', elementPath(element));
  const originalLength = element.textContent?.length ?? 0;
  pushRedaction(redactions, element, 'executable-element', {
    kind: 'element',
    originalLength,
  });
  element.replaceWith(replacement);
}

function redactFormControlContent(
  element: Element,
  redactions: ExtendedDiagnosticRedaction[]
): void {
  if (element.localName !== 'textarea' && element.localName !== 'option') return;
  const originalLength = element.textContent?.length ?? 0;
  if (originalLength > 0) {
    pushRedaction(redactions, element, 'form-control-state', {
      kind: 'content',
      originalLength,
    });
  }
  element.textContent = '';
}

function redactTextNodes(root: Node): void {
  const documentRoot = root.ownerDocument!;
  const nodeFilter = documentRoot.defaultView?.NodeFilter ?? NodeFilter;
  const walker = documentRoot.createTreeWalker(root, nodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const text = current.nodeValue ?? '';
    current.nodeValue = sanitizeScalar('visibleContent', text);
    current = walker.nextNode();
  }
  for (const element of collectProjectionElements(root)) {
    if (element.localName === 'template') {
      redactTextNodes((element as HTMLTemplateElement).content);
    }
  }
}

function removeExtensionOwnedElements(
  elements: readonly Element[],
  redactions: ExtendedDiagnosticRedaction[]
): void {
  for (const element of elements.filter((candidate) => candidate.id === CONTENT_ROOT_ID)) {
    pushRedaction(redactions, element, 'extension-owned-element', {
      kind: 'element',
    });
    element.remove();
  }
}

function collectProjectionElements(root: Node): Element[] {
  const documentRoot = root.ownerDocument!;
  const nodeFilter = documentRoot.defaultView?.NodeFilter ?? NodeFilter;
  const walker = documentRoot.createTreeWalker(root, nodeFilter.SHOW_ELEMENT);
  const elements: Element[] = [];
  if (root.nodeType === root.ELEMENT_NODE) elements.push(root as Element);
  let current = walker.nextNode();
  while (current) {
    const element = current as Element;
    elements.push(element);
    if (element.localName === 'template') {
      elements.push(...collectProjectionElements((element as HTMLTemplateElement).content));
    }
    current = walker.nextNode();
  }
  return elements;
}

function sanitizeProjection(root: Element): ExtendedDiagnosticRedaction[] {
  const redactions: ExtendedDiagnosticRedaction[] = [];
  const elements = collectProjectionElements(root);
  removeExtensionOwnedElements(elements, redactions);
  for (const element of elements) {
    if (
      element.localName === 'script' ||
      element.localName === 'object' ||
      element.localName === 'embed'
    ) {
      replaceExecutableElement(element, redactions);
      continue;
    }
    if (element.localName === 'style') {
      const originalLength = element.textContent?.length ?? 0;
      pushRedaction(redactions, element, 'stylesheet-body', {
        kind: 'content',
        originalLength,
      });
      const replacement = element.ownerDocument.createElement('template');
      replacement.setAttribute('data-sniptale-diagnostic-placeholder', 'style');
      replacement.setAttribute('data-sniptale-diagnostic-length', String(originalLength));
      element.replaceWith(replacement);
      continue;
    }
    redactAttributes(element, redactions);
    redactFormControlContent(element, redactions);
  }
  redactTextNodes(root);
  return redactions;
}

function serializeDocument(documentRoot: Document, root: Element): string {
  const doctype = documentRoot.doctype
    ? `<!DOCTYPE ${documentRoot.doctype.name}>`
    : '<!DOCTYPE html>';
  return `${doctype}\n${root.outerHTML}`;
}

function inspectDocumentInput(documentRoot: Document, sourceRoot: Element): number {
  const nodeFilter = documentRoot.defaultView?.NodeFilter ?? NodeFilter;
  let elementCount = 0;
  let totalBytes = 0;
  const admit = (value: string): void => {
    const remaining = MAX_EXTENDED_DIAGNOSTIC_DOM_INPUT_BYTES - totalBytes;
    const size = estimateUtf8Bytes(value, remaining);
    if (size > remaining) {
      throw new Error('Extended diagnostic DOM exceeds the input byte limit.');
    }
    totalBytes += size;
  };
  if (documentRoot.doctype) admit(documentRoot.doctype.name);

  const inspectRoot = (root: Node, includeRoot: boolean): void => {
    const walker = documentRoot.createTreeWalker(root, nodeFilter.SHOW_ALL);
    let current: Node | null = includeRoot ? root : walker.nextNode();
    while (current) {
      if (current.nodeType === current.ELEMENT_NODE) {
        elementCount += 1;
        if (elementCount > MAX_EXTENDED_DIAGNOSTIC_ELEMENTS) {
          throw new Error('Extended diagnostic DOM exceeds the element limit.');
        }
        const element = current as Element;
        admit(element.localName);
        for (let index = 0; index < element.attributes.length; index += 1) {
          const attribute = element.attributes.item(index);
          if (!attribute) continue;
          admit(attribute.name);
          admit(attribute.value);
        }
        if (element.localName === 'template') {
          inspectRoot((element as HTMLTemplateElement).content, false);
        }
      } else if (current.nodeValue) {
        admit(current.nodeValue);
      }
      current = walker.nextNode();
    }
  };
  inspectRoot(sourceRoot, true);
  return elementCount;
}

export function admitExtendedDiagnosticDomInput(
  documentRoot: Document
): ExtendedDiagnosticDomAdmission {
  const sourceRoot = documentRoot.documentElement;
  if (!sourceRoot) throw new Error('Extended diagnostic evidence requires a document element.');
  return {
    documentRoot,
    elementCount: inspectDocumentInput(documentRoot, sourceRoot),
    sourceRoot,
  };
}

export function buildExtendedDiagnosticDomProjection(
  documentRoot: Document,
  admission = admitExtendedDiagnosticDomInput(documentRoot)
): ExtendedDiagnosticDomProjection {
  if (
    admission.documentRoot !== documentRoot ||
    admission.sourceRoot !== documentRoot.documentElement
  ) {
    throw new Error('Extended diagnostic DOM admission does not match its document.');
  }
  const { elementCount, sourceRoot } = admission;
  const clone = sourceRoot.cloneNode(true) as Element;
  const redactions = sanitizeProjection(clone);
  const html = serializeDocument(documentRoot, clone);
  if (
    estimateUtf8Bytes(html, MAX_EXTENDED_DIAGNOSTIC_HTML_BYTES) > MAX_EXTENDED_DIAGNOSTIC_HTML_BYTES
  ) {
    throw new Error('Extended diagnostic DOM exceeds the byte limit.');
  }
  return { elementCount, html, redactions };
}
