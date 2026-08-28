// policyStateIds: [] - URL attribute allowlists are immutable redaction policy, not authority.
import { sanitizeDiagnosticUrl } from '@sniptale/platform/observability/diagnostics/sanitizer';

const URL_ATTRIBUTE_NAMES = [
  'action',
  'background',
  'cite',
  'data',
  'data-background-url',
  'data-href',
  'data-iframe-src',
  'data-origin',
  'data-original',
  'data-original-src',
  'data-src',
  'data-url',
  'formaction',
  'href',
  'imagesrcset',
  'manifest',
  'ping',
  'poster',
  'src',
  'xlink:href',
] as const;
const SRCSET_ATTRIBUTE_NAMES = ['data-srcset', 'imagesrcset', 'srcset'] as const;
const REMOVED_CONTENT_ATTRIBUTES = ['srcdoc', 'style'] as const;
const URL_ATTRIBUTE_NAME_SET = new Set<string>(URL_ATTRIBUTE_NAMES);
const SRCSET_ATTRIBUTE_NAME_SET = new Set<string>(SRCSET_ATTRIBUTE_NAMES);
const DATA_SRCSET_ATTRIBUTE_NAMES = new Set(['data-image-srcset']);
type DiagnosticAttributeUrlSanitizer = (url: string | undefined) => string | undefined;

function normalizeAttributeName(attributeName: string): string {
  return attributeName.toLowerCase().replace(/_/g, '-');
}

function isUrlAttributeName(attributeName: string): boolean {
  const normalized = normalizeAttributeName(attributeName);
  return URL_ATTRIBUTE_NAME_SET.has(normalized);
}

function isSrcsetAttributeName(attributeName: string): boolean {
  const normalized = normalizeAttributeName(attributeName);
  return SRCSET_ATTRIBUTE_NAME_SET.has(normalized) || DATA_SRCSET_ATTRIBUTE_NAMES.has(normalized);
}

export function isRetainedUrlAttributeName(attributeName: string): boolean {
  return isUrlAttributeName(attributeName) || isSrcsetAttributeName(attributeName);
}

export function sanitizeDiagnosticUrlAttributeValue(
  attributeName: string,
  value: string,
  sanitizeUrl: DiagnosticAttributeUrlSanitizer = sanitizeDiagnosticUrl
): string | null {
  if (isSrcsetAttributeName(attributeName)) {
    return sanitizeDiagnosticSrcsetAttribute(value, sanitizeUrl);
  }
  if (!isUrlAttributeName(attributeName)) return null;
  return normalizeAttributeName(attributeName) === 'ping'
    ? sanitizeDiagnosticUrlListAttribute(value, sanitizeUrl)
    : (sanitizeUrl(value) ?? '');
}

export function sanitizeUrlAttributes(element: HTMLElement): void {
  for (const attributeName of REMOVED_CONTENT_ATTRIBUTES) {
    element.removeAttribute(attributeName);
  }
  for (const attribute of Array.from(element.attributes)) {
    const sanitizedValue = sanitizeDiagnosticUrlAttributeValue(attribute.name, attribute.value);
    if (sanitizedValue !== null) element.setAttribute(attribute.name, sanitizedValue);
  }
}

function sanitizeDiagnosticSrcsetAttribute(
  value: string,
  sanitizeUrl: DiagnosticAttributeUrlSanitizer = sanitizeDiagnosticUrl
): string {
  return splitSrcsetCandidates(value)
    .map((candidate) => sanitizeSrcsetCandidate(candidate.trim(), sanitizeUrl))
    .filter((candidate) => candidate.length > 0)
    .join(', ');
}

function sanitizeDiagnosticUrlListAttribute(
  value: string,
  sanitizeUrl: DiagnosticAttributeUrlSanitizer = sanitizeDiagnosticUrl
): string {
  return splitByWhitespace(value)
    .map((url) => sanitizeUrl(url) ?? '')
    .filter(Boolean)
    .join(' ');
}

function splitSrcsetCandidates(value: string): string[] {
  const candidates: string[] = [];
  let current = '';
  let dataUrlCandidate = false;
  let inDataUrlPayload = false;

  for (const char of value) {
    if (char === ',' && !inDataUrlPayload) {
      candidates.push(current);
      current = '';
      dataUrlCandidate = false;
      continue;
    }

    current += char;
    if (!dataUrlCandidate && current.trimStart().toLowerCase().startsWith('data:')) {
      dataUrlCandidate = true;
      inDataUrlPayload = true;
      continue;
    }
    if (inDataUrlPayload && isWhitespaceChar(char)) {
      inDataUrlPayload = false;
    }
  }

  candidates.push(current);
  return candidates;
}

function sanitizeSrcsetCandidate(
  candidate: string,
  sanitizeUrl: DiagnosticAttributeUrlSanitizer
): string {
  const [url = '', ...descriptorParts] = splitByWhitespace(candidate);
  const sanitizedUrl = sanitizeUrl(url) ?? '';
  const descriptor = sanitizeSrcsetDescriptor(descriptorParts);
  return descriptor ? `${sanitizedUrl} ${descriptor}` : sanitizedUrl;
}

function splitByWhitespace(value: string): string[] {
  const parts: string[] = [];
  let current = '';

  for (const char of value) {
    if (isWhitespaceChar(char)) {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (current) {
    parts.push(current);
  }
  return parts;
}

function isWhitespaceChar(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t' || char === '\f';
}

function sanitizeSrcsetDescriptor(descriptorParts: string[]): string {
  const descriptor = descriptorParts.find(isValidSrcsetDescriptor);
  return descriptor ?? '';
}

function isValidSrcsetDescriptor(descriptor: string): boolean {
  if (descriptor.endsWith('w')) {
    return isDigitsOnly(descriptor.slice(0, -1));
  }

  return descriptor.endsWith('x') && isDensityDescriptorValue(descriptor.slice(0, -1));
}

function isDigitsOnly(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  for (const char of value) {
    if (char < '0' || char > '9') {
      return false;
    }
  }

  return true;
}

function isDensityDescriptorValue(value: string): boolean {
  const dotIndex = value.indexOf('.');
  if (dotIndex < 0) {
    return isDigitsOnly(value);
  }

  if (dotIndex === 0 || dotIndex === value.length - 1 || value.indexOf('.', dotIndex + 1) >= 0) {
    return false;
  }

  return isDigitsOnly(value.slice(0, dotIndex)) && isDigitsOnly(value.slice(dotIndex + 1));
}
