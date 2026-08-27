import {
  isSafeWebSnapshotUrl,
  collectWebSnapshotQueryRoots,
  sanitizeWebSnapshotAttribute,
  sanitizeWebSnapshotCssText,
  sanitizeWebSnapshotStylesheetText,
  removeWebSnapshotSensitiveControlState,
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
  warnings: PreparedSnapshotWarning[],
  preserveAssetUrls: boolean
): void {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name.toLowerCase() === 'style') {
      const sanitizedStyle = sanitizeWebSnapshotCssText(
        attribute.value,
        preserveAssetUrls ? (url) => resolvePreparedCssUrl(url, baseUrl) : () => null
      );
      element.setAttribute(attribute.name, sanitizedStyle);
      continue;
    }
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

function resolvePreparedCssUrl(value: string, baseUrl: string): string | null {
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith('#')) return trimmedValue;
  if (!isSafeWebSnapshotUrl(trimmedValue, baseUrl)) return null;
  try {
    const url = new URL(trimmedValue, baseUrl);
    return ['data:', 'http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function sanitizeStyleElements(
  root: ParentNode,
  baseUrl: string,
  preserveAssetUrls: boolean
): void {
  for (const styleElement of root.querySelectorAll('style')) {
    styleElement.textContent = sanitizeWebSnapshotStylesheetText(
      styleElement.textContent ?? '',
      preserveAssetUrls ? (url) => resolvePreparedCssUrl(url, baseUrl) : () => null
    );
  }
}

export function sanitizePreparedSnapshotDocument(
  snapshot: Document,
  baseUrl: string,
  options: { preserveAssetUrls?: boolean } = {}
): PreparedSnapshotWarning[] {
  const warnings: PreparedSnapshotWarning[] = [];
  const preserveAssetUrls = options.preserveAssetUrls === true;
  for (const root of collectWebSnapshotQueryRoots(snapshot)) {
    removeElements(root, EXECUTABLE_SELECTORS, warnings);
    replaceExecutableIframes(root, baseUrl, warnings);
    disableUnsafeFormBehavior(root);
    removeWebSnapshotSensitiveControlState(root);
    sanitizeStyleElements(root, baseUrl, preserveAssetUrls);
    for (const element of root.querySelectorAll('*')) {
      sanitizeElementAttributes(element, baseUrl, warnings, preserveAssetUrls);
    }
  }

  return warnings;
}

export function serializePreparedSnapshotDocument(snapshot: Document): string {
  return `<!doctype html>\n${snapshot.documentElement.outerHTML}`;
}
