import {
  isSensitiveUrlComponentName,
  redactSensitiveString,
} from '../../security/secret-redaction';

const DIAGNOSTIC_URL_MAX_LENGTH = 300;
const DIAGNOSTIC_URL_SECRET_VALUE = 'redacted';
const DIAGNOSTIC_URL_EXTRA_SECRET_QUERY_FRAGMENTS = ['auth', 'code', 'email', 'key'] as const;
const DIAGNOSTIC_RELATIVE_URL_BASE = 'https://diagnostic.invalid';
const STRUCTURED_URL_FIELD_KEYS = new Set([
  'action',
  'href',
  'linkref',
  'pendingiframes',
  'poster',
  'previewsrc',
  'src',
]);

type ParsedDiagnosticUrl = {
  kind: 'absolute' | 'opaque' | 'protocol-relative' | 'relative';
  original: string;
  parsedUrl: URL;
};

export function isDiagnosticUrlField(key: string): boolean {
  return key.toLowerCase().endsWith('url');
}

export function isSensitiveDiagnosticQueryName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return (
    isSensitiveUrlComponentName(name) ||
    DIAGNOSTIC_URL_EXTRA_SECRET_QUERY_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  );
}

export function isStructuredUrlFieldKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return isDiagnosticUrlField(key) || STRUCTURED_URL_FIELD_KEYS.has(normalized);
}

export function looksLikeDiagnosticUrl(value: string): boolean {
  const normalized = value.trim();
  if (/\s/.test(value.trim())) {
    return false;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return (
      normalized.startsWith('/') ||
      normalized.startsWith('./') ||
      normalized.startsWith('../') ||
      looksLikeBarePathDiagnosticUrl(normalized)
    );
  }
}

function looksLikeBarePathDiagnosticUrl(value: string): boolean {
  return (
    (value.includes('?') || value.includes('#')) && !value.startsWith('?') && !value.startsWith('#')
  );
}

function sanitizeDiagnosticUrlText(value: string): string {
  return redactSensitiveString(value, DIAGNOSTIC_URL_MAX_LENGTH);
}

function stripDiagnosticUrlQueryAndHash(url: string): string {
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const cutoffIndexes = [queryIndex, hashIndex].filter((index) => index >= 0);
  if (cutoffIndexes.length === 0) {
    return url;
  }

  return url.slice(0, Math.min(...cutoffIndexes));
}

function stripDiagnosticUrlHash(url: string): string {
  const hashIndex = url.indexOf('#');
  return hashIndex >= 0 ? url.slice(0, hashIndex) : url;
}

function redactUrlCredentials(parsedUrl: URL): void {
  parsedUrl.username = '';
  parsedUrl.password = '';
}

function redactSensitiveUrlSearchParams(parsedUrl: URL): void {
  for (const name of Array.from(parsedUrl.searchParams.keys())) {
    if (isSensitiveDiagnosticQueryName(name)) {
      parsedUrl.searchParams.set(name, DIAGNOSTIC_URL_SECRET_VALUE);
    }
  }
}

function parseDiagnosticUrl(url: string): ParsedDiagnosticUrl {
  if (/\s/.test(url.trim())) {
    throw new Error('Diagnostic URL contains whitespace');
  }

  if (url.startsWith('//')) {
    return {
      kind: 'protocol-relative',
      original: url,
      parsedUrl: new URL(`https:${url}`),
    };
  }

  try {
    const parsedUrl = new URL(url);
    return isSupportedDiagnosticUrlProtocol(parsedUrl)
      ? { kind: 'absolute', original: url, parsedUrl }
      : { kind: 'opaque', original: url, parsedUrl };
  } catch {
    return {
      kind: 'relative',
      original: url,
      parsedUrl: new URL(url, DIAGNOSTIC_RELATIVE_URL_BASE),
    };
  }
}

function isSupportedDiagnosticUrlProtocol(parsedUrl: URL): boolean {
  return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
}

function formatDiagnosticUrl({ kind, original, parsedUrl }: ParsedDiagnosticUrl): string {
  if (kind === 'opaque') {
    return `[${parsedUrl.protocol.replace(/:$/, '')} URL redacted]`;
  }

  if (kind === 'absolute') {
    return parsedUrl.toString();
  }

  const path = `${parsedUrl.pathname}${parsedUrl.search}`;
  if (kind === 'protocol-relative') {
    return `//${parsedUrl.host}${path}`;
  }
  return original.startsWith('/') ? path : path.replace(/^\//, '');
}

/**
 * Removes query and hash fragments from URLs before they are stored in diagnostics.
 */
export function sanitizeDiagnosticUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsedDiagnosticUrl = parseDiagnosticUrl(url);
    const { parsedUrl } = parsedDiagnosticUrl;
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return sanitizeDiagnosticUrlText(
      parsedDiagnosticUrl.kind === 'absolute'
        ? `${parsedUrl.origin}${parsedUrl.pathname}`
        : formatDiagnosticUrl(parsedDiagnosticUrl)
    );
  } catch {
    return sanitizeDiagnosticUrlText(stripDiagnosticUrlQueryAndHash(url));
  }
}

/**
 * Redacts reusable credentials from diagnostic URLs without dropping safe query parameters.
 */
export function redactDiagnosticUrlSecrets(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsedDiagnosticUrl = parseDiagnosticUrl(url);
    const { parsedUrl } = parsedDiagnosticUrl;
    redactUrlCredentials(parsedUrl);
    redactSensitiveUrlSearchParams(parsedUrl);
    parsedUrl.hash = '';
    return sanitizeDiagnosticUrlText(formatDiagnosticUrl(parsedDiagnosticUrl));
  } catch {
    return sanitizeDiagnosticUrlText(stripDiagnosticUrlHash(url));
  }
}
