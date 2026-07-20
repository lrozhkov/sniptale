import { sanitizeWebSnapshotCssText } from './sanitize-css';

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

interface WebSnapshotHtmlSanitizeOptions {
  allowedObjectUrls?: readonly string[];
  offlineOnly?: boolean;
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
      element.setAttribute(attribute.name, sanitizeWebSnapshotCssText(attribute.value));
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
    return allowedObjectUrls.has(attribute.value.trim()) ? 'keep' : 'defer';
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

function sanitizeStyleElements(document: Document): void {
  for (const styleElement of document.querySelectorAll('style')) {
    styleElement.textContent = sanitizeWebSnapshotCssText(styleElement.textContent ?? '');
  }
}

function disableFormSubmissions(document: Document): void {
  for (const form of document.querySelectorAll('form')) {
    form.setAttribute('data-sniptale-disabled-form', 'true');
    for (const attribute of FORM_ATTRIBUTE_NAMES) {
      form.removeAttribute(attribute);
    }
  }
}

export function sanitizeWebSnapshotHtml(
  html: string,
  baseUrl: string | null,
  options: WebSnapshotHtmlSanitizeOptions = {}
): string {
  const document = new DOMParser().parseFromString(html, 'text/html');

  for (const element of document.querySelectorAll(EXECUTABLE_ELEMENT_SELECTORS.join(','))) {
    element.remove();
  }

  disableFormSubmissions(document);
  sanitizeStyleElements(document);

  for (const element of document.querySelectorAll('*')) {
    sanitizeElementAttributes(element, baseUrl, options);
  }

  return `<!doctype html>${document.documentElement.outerHTML}`;
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
