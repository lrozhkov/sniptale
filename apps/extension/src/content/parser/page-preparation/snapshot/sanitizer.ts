import {
  sanitizeWebSnapshotAttribute,
  sanitizeWebSnapshotCssText,
} from '../../../../features/web-snapshot/public';
import type { PreparedSnapshotWarning } from './types';
import {
  createIframeUnreadableWarning,
  createSanitizerDropWarning,
  describeIframeTarget,
} from './warnings';

const EXECUTABLE_SELECTORS = [
  'script',
  'noscript',
  'object',
  'embed',
  'meta[http-equiv="refresh" i]',
];

const SNIPTALE_RUNTIME_SELECTORS = [
  '#sniptale-extension-root',
  '#sniptale-content-app-root',
  '#sniptale-resize-handles-portal',
  '.sniptale-app',
  '.sniptale-toolbar-portal-wrapper',
  '.sniptale-action-toolbar',
  '.sniptale-content-size-tooltip',
  '.sniptale-resize-handle',
  '.sniptale-frame-settings-popover',
  '.sniptale-step-badge-popover',
  '.sniptale-callout-settings-popover',
  '.sniptale-callout-format-toolbar',
  '.sniptale-glass-popover',
  '.sniptale-blocking-overlay',
  '.sniptale-editing-blocking-overlay',
];

function removeElements(
  root: ParentNode,
  selectors: string[],
  warnings: PreparedSnapshotWarning[]
) {
  for (const element of root.querySelectorAll(selectors.join(','))) {
    warnings.push(createSanitizerDropWarning(element.tagName.toLowerCase()));
    element.remove();
  }
}

function createIframePlaceholder(
  iframe: HTMLIFrameElement,
  baseUrl: string,
  snapshotDocument: Document
): HTMLDivElement {
  const placeholder = snapshotDocument.createElement('div');
  const target = describeIframeTarget(iframe, baseUrl);
  placeholder.setAttribute('data-virtual-iframe', 'true');
  placeholder.setAttribute('data-iframe-unreadable', 'true');
  placeholder.setAttribute('data-iframe-source', iframe.id || target);
  placeholder.textContent = 'Iframe content unavailable in static snapshot.';
  return placeholder;
}

function replaceExecutableIframes(
  root: ParentNode,
  baseUrl: string,
  warnings: PreparedSnapshotWarning[]
): void {
  const snapshotDocument = root.ownerDocument ?? document;
  for (const iframe of Array.from(root.querySelectorAll('iframe'))) {
    warnings.push(createIframeUnreadableWarning(iframe, baseUrl));
    iframe.replaceWith(createIframePlaceholder(iframe, baseUrl, snapshotDocument));
  }
}

function sanitizeElementAttributes(
  element: Element,
  baseUrl: string,
  warnings: PreparedSnapshotWarning[]
): void {
  for (const attribute of Array.from(element.attributes)) {
    const sanitized = sanitizeWebSnapshotAttribute(attribute.name, attribute.value, baseUrl);

    if (sanitized === null) {
      warnings.push(
        createSanitizerDropWarning(`${element.tagName.toLowerCase()}[${attribute.name}]`)
      );
      element.removeAttribute(attribute.name);
    } else if (sanitized !== attribute.value) {
      element.setAttribute(attribute.name, sanitized);
    }
  }
}

function disableUnsafeFormBehavior(root: ParentNode): void {
  for (const form of root.querySelectorAll('form')) {
    form.setAttribute('data-sniptale-disabled-form', 'true');
    form.removeAttribute('action');
    form.removeAttribute('method');
    form.removeAttribute('target');
  }
}

function sanitizeStyleElements(root: ParentNode): void {
  for (const styleElement of root.querySelectorAll('style')) {
    styleElement.textContent = sanitizeWebSnapshotCssText(styleElement.textContent ?? '');
  }
}

export function sanitizePreparedSnapshotDocument(
  snapshot: Document,
  baseUrl: string
): PreparedSnapshotWarning[] {
  const warnings: PreparedSnapshotWarning[] = [];
  removeElements(snapshot, EXECUTABLE_SELECTORS, warnings);
  replaceExecutableIframes(snapshot, baseUrl, warnings);
  disableUnsafeFormBehavior(snapshot);
  sanitizeStyleElements(snapshot);
  removeElements(snapshot, SNIPTALE_RUNTIME_SELECTORS, warnings);

  for (const element of snapshot.querySelectorAll('*')) {
    sanitizeElementAttributes(element, baseUrl, warnings);
  }

  return warnings;
}

export function serializePreparedSnapshotDocument(snapshot: Document): string {
  return `<!doctype html>\n${snapshot.documentElement.outerHTML}`;
}
