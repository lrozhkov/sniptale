import { sanitizeWebSnapshotCssText, sanitizeWebSnapshotStylesheetText } from './sanitize-css';
import { createSafeExternalHref } from '@sniptale/platform/security/safe-url';

const SAFE_WEB_SNAPSHOT_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const SAFE_WEB_SNAPSHOT_DATA_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const BLOCKED_ATTRIBUTE_PREFIX = 'on';
const BLOCKED_ATTRIBUTE_NAMES = new Set(['formaction', 'srcdoc']);
const URL_ATTRIBUTE_NAMES = new Set(['action', 'href', 'poster', 'src', 'srcset', 'xlink:href']);
const EXECUTABLE_ELEMENT_SELECTORS = [
  'script',
  'noscript',
  'object',
  'embed',
  'iframe',
  'meta[http-equiv="refresh" i]',
];
const FORM_ATTRIBUTE_NAMES = ['action', 'method', 'target'] as const;
export const WEB_SNAPSHOT_EXTERNAL_LINK_ATTRIBUTE = 'data-sniptale-external-href';

interface WebSnapshotHtmlSanitizeOptions {
  allowedObjectUrls?: readonly string[];
  offlineOnly?: boolean;
}

const WEB_SNAPSHOT_XHTML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

export function collectWebSnapshotQueryRoots(root: ParentNode): ParentNode[] {
  const roots: ParentNode[] = [root];
  for (let index = 0; index < roots.length; index += 1) {
    const current = roots[index];
    if (!current) continue;
    for (const template of current.querySelectorAll<HTMLTemplateElement>(
      'template[shadowrootmode]'
    )) {
      roots.push(template.content);
    }
  }
  return roots;
}

function createOfflineCssUrlRewriter(
  options: WebSnapshotHtmlSanitizeOptions
): ((url: string) => string | null) | undefined {
  if (!options.offlineOnly) return undefined;
  const allowedObjectUrls = new Set(options.allowedObjectUrls ?? []);
  return (value) => {
    const trimmedValue = value.trim();
    if (trimmedValue.startsWith('#') || allowedObjectUrls.has(trimmedValue)) {
      return trimmedValue;
    }
    try {
      return isSafeWebSnapshotDataUrl(new URL(trimmedValue)) ? trimmedValue : null;
    } catch {
      return null;
    }
  };
}

function isSafeWebSnapshotDataUrl(url: URL): boolean {
  if (url.protocol !== 'data:') {
    return false;
  }

  const mimeType = url.pathname.split(';', 1)[0]?.toLowerCase();
  return mimeType !== undefined && SAFE_WEB_SNAPSHOT_DATA_MIME_TYPES.has(mimeType);
}

export function isSafeWebSnapshotUrl(value: string, baseUrl: string | null): boolean {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0 || trimmedValue.startsWith('#')) {
    return true;
  }

  try {
    const url = new URL(trimmedValue, baseUrl ?? 'https://sniptale.invalid/');
    return SAFE_WEB_SNAPSHOT_PROTOCOLS.has(url.protocol) || isSafeWebSnapshotDataUrl(url);
  } catch {
    return false;
  }
}

/**
 * Capture-only URL policy. Inline SVG is admitted here so it can be decoded, sanitized, and
 * rewritten to an inert local asset; it remains forbidden in the final HTML URL policy.
 */
export function isSafeWebSnapshotCaptureAssetUrl(value: string, baseUrl: string | null): boolean {
  if (isSafeWebSnapshotUrl(value, baseUrl)) return true;
  try {
    const url = new URL(value.trim(), baseUrl ?? 'https://sniptale.invalid/');
    return url.protocol === 'data:' && /^data:image\/svg\+xml(?:[;,])/iu.test(url.href);
  } catch {
    return false;
  }
}

const SENSITIVE_AUTOCOMPLETE_FIELD_TOKENS = new Set([
  'current-password',
  'new-password',
  'one-time-code',
  'transaction-amount',
  'transaction-currency',
]);

export function shouldExcludeWebSnapshotFormControlValue(element: Element): boolean {
  if (element.tagName.toLowerCase() === 'input') {
    const type = element.getAttribute('type')?.trim().toLowerCase() ?? 'text';
    if (type === 'file' || type === 'hidden' || type === 'password') return true;
  }
  const autocompleteTokens =
    element
      .getAttribute('autocomplete')
      ?.trim()
      .toLowerCase()
      .split(/[\t\n\f\r ]+/u)
      .filter(Boolean) ?? [];
  return autocompleteTokens.some(
    (token) => token.startsWith('cc-') || SENSITIVE_AUTOCOMPLETE_FIELD_TOKENS.has(token)
  );
}

function isSafeWebSnapshotSrcset(value: string, baseUrl: string | null): boolean {
  return value
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .every((candidate) => {
      const [url = ''] = candidate.split(/\s+/);
      return isSafeWebSnapshotUrl(url, baseUrl);
    });
}

export function sanitizeWebSnapshotAttribute(
  name: string,
  value: string,
  baseUrl: string | null
): string | null {
  const normalizedName = name.toLowerCase();
  if (
    normalizedName.startsWith(BLOCKED_ATTRIBUTE_PREFIX) ||
    BLOCKED_ATTRIBUTE_NAMES.has(normalizedName)
  ) {
    return null;
  }

  if (normalizedName === 'style') {
    return sanitizeWebSnapshotCssText(value);
  }

  if (normalizedName === 'srcset' && !isSafeWebSnapshotSrcset(value, baseUrl)) {
    return null;
  }

  if (
    normalizedName !== 'srcset' &&
    URL_ATTRIBUTE_NAMES.has(normalizedName) &&
    !isSafeWebSnapshotUrl(value, baseUrl)
  ) {
    return null;
  }

  return value;
}

export { sanitizeWebSnapshotCssText };

function sanitizeElementAttributes(
  element: Element,
  baseUrl: string | null,
  options: WebSnapshotHtmlSanitizeOptions
): void {
  const allowedObjectUrls = new Set(options.allowedObjectUrls ?? []);
  const rewriteCssUrl = createOfflineCssUrlRewriter(options);
  const externalHref = options.offlineOnly
    ? resolveOfflineExternalAnchorHref(element, baseUrl)
    : null;

  // Never trust a page-authored capability attribute. Viewer navigation is projected only from
  // the real href after URL validation below.
  element.removeAttribute(WEB_SNAPSHOT_EXTERNAL_LINK_ATTRIBUTE);

  for (const attribute of Array.from(element.attributes)) {
    const normalizedName = attribute.name.toLowerCase();
    if (isBlockedWebSnapshotAttribute(normalizedName)) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (options.offlineOnly) {
      const offlineResult = sanitizeOfflineAttribute(attribute, normalizedName, allowedObjectUrls);
      if (offlineResult === 'remove') {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (offlineResult === 'keep') {
        continue;
      }
    }

    if (normalizedName === 'style') {
      element.setAttribute(
        attribute.name,
        sanitizeWebSnapshotCssText(attribute.value, rewriteCssUrl)
      );
      continue;
    }

    const sanitized = sanitizeWebSnapshotAttribute(attribute.name, attribute.value, baseUrl);
    if (sanitized === null) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (sanitized !== attribute.value) {
      element.setAttribute(attribute.name, sanitized);
    }
  }

  if (externalHref !== null) {
    element.setAttribute(WEB_SNAPSHOT_EXTERNAL_LINK_ATTRIBUTE, externalHref);
  }
}

function resolveOfflineExternalAnchorHref(element: Element, baseUrl: string | null): string | null {
  if (element.tagName.toLowerCase() !== 'a') return null;
  const href = element.getAttribute('href');
  if (href === null || baseUrl === null) return null;

  try {
    return createSafeExternalHref(new URL(href, baseUrl).toString());
  } catch {
    return null;
  }
}

function isBlockedWebSnapshotAttribute(normalizedName: string): boolean {
  return (
    normalizedName.startsWith(BLOCKED_ATTRIBUTE_PREFIX) ||
    BLOCKED_ATTRIBUTE_NAMES.has(normalizedName)
  );
}

function sanitizeOfflineAttribute(
  attribute: Attr,
  normalizedName: string,
  allowedObjectUrls: Set<string>
): 'defer' | 'keep' | 'remove' {
  if (normalizedName === 'style') {
    return 'defer';
  }
  if (normalizedName === 'srcset') {
    return isSafeOfflineWebSnapshotSrcset(attribute.value, allowedObjectUrls) ? 'keep' : 'remove';
  }
  if (normalizedName === 'href' && isNavigationHrefAttribute(attribute)) {
    return 'remove';
  }
  if (URL_ATTRIBUTE_NAMES.has(normalizedName)) {
    return isSafeOfflineWebSnapshotUrl(attribute.value, allowedObjectUrls) ? 'keep' : 'remove';
  }
  return 'defer';
}

function isNavigationHrefAttribute(attribute: Attr): boolean {
  const tagName = attribute.ownerElement?.tagName.toLowerCase();
  return tagName === 'a';
}

function isSafeOfflineWebSnapshotSrcset(value: string, allowedObjectUrls: Set<string>): boolean {
  return value
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .every((candidate) => {
      const [url = ''] = candidate.split(/\s+/);
      return isSafeOfflineWebSnapshotUrl(url, allowedObjectUrls);
    });
}

function isSafeOfflineWebSnapshotUrl(value: string, allowedObjectUrls: Set<string>): boolean {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0 || trimmedValue.startsWith('#')) {
    return true;
  }
  if (allowedObjectUrls.has(trimmedValue)) {
    return true;
  }

  try {
    const url = new URL(trimmedValue, 'https://sniptale.invalid/');
    return url.protocol === 'mailto:' || url.protocol === 'tel:' || isSafeWebSnapshotDataUrl(url);
  } catch {
    return false;
  }
}

function sanitizeStyleElements(root: ParentNode, options: WebSnapshotHtmlSanitizeOptions): void {
  const rewriteCssUrl = createOfflineCssUrlRewriter(options);
  for (const styleElement of root.querySelectorAll('style')) {
    styleElement.textContent = sanitizeWebSnapshotStylesheetText(
      styleElement.textContent ?? '',
      rewriteCssUrl
    );
  }
}

function disableFormSubmissions(root: ParentNode): void {
  for (const form of root.querySelectorAll('form')) {
    form.setAttribute('data-sniptale-disabled-form', 'true');
    for (const attribute of FORM_ATTRIBUTE_NAMES) {
      form.removeAttribute(attribute);
    }
  }
}

export function removeWebSnapshotSensitiveControlState(root: ParentNode): void {
  for (const control of root.querySelectorAll('input, select, textarea')) {
    if (!shouldExcludeWebSnapshotFormControlValue(control)) continue;
    if (control.tagName.toLowerCase() === 'input') {
      control.removeAttribute('checked');
      control.removeAttribute('value');
    } else if (control.tagName.toLowerCase() === 'textarea') {
      control.removeAttribute('value');
      control.textContent = '';
    } else {
      control.removeAttribute('value');
      control.replaceChildren();
    }
  }
}

function sanitizeWebSnapshotDocument(
  document: Document,
  baseUrl: string | null,
  options: WebSnapshotHtmlSanitizeOptions = {}
): void {
  for (const root of collectWebSnapshotQueryRoots(document)) {
    for (const element of root.querySelectorAll(EXECUTABLE_ELEMENT_SELECTORS.join(','))) {
      element.remove();
    }
    disableFormSubmissions(root);
    removeWebSnapshotSensitiveControlState(root);
    sanitizeStyleElements(root, options);
    for (const element of root.querySelectorAll('*')) {
      sanitizeElementAttributes(element, baseUrl, options);
    }
  }
}

export function sanitizeWebSnapshotHtml(
  html: string,
  baseUrl: string | null,
  options: WebSnapshotHtmlSanitizeOptions = {}
): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  sanitizeWebSnapshotDocument(document, baseUrl, options);

  return `<!doctype html>${document.documentElement.outerHTML}`;
}

export function isWebSnapshotXhtml(value: string): boolean {
  return value.trimStart().startsWith('<?xml');
}

export function serializeWebSnapshotXhtmlDocument(document: Document): string {
  const serialized = new XMLSerializer().serializeToString(document.documentElement);
  return `${WEB_SNAPSHOT_XHTML_DECLARATION}${serialized.replaceAll('\r', '&#13;')}`;
}

export function sanitizeWebSnapshotXhtml(
  xhtml: string,
  baseUrl: string | null,
  options: WebSnapshotHtmlSanitizeOptions = {}
): string {
  const document = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml');
  if (document.querySelector('parsererror')) {
    throw new Error('Web snapshot XHTML is invalid.');
  }
  sanitizeWebSnapshotDocument(document, baseUrl, options);
  return serializeWebSnapshotXhtmlDocument(document);
}

export function sanitizeWebSnapshotFilename(value: string, fallback = 'web-snapshot'): string {
  const sanitized = value
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '_')
    .slice(0, 80);

  return sanitized || fallback;
}

export function sanitizeWebSnapshotSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!SAFE_WEB_SNAPSHOT_PROTOCOLS.has(url.protocol)) {
      return null;
    }
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}
