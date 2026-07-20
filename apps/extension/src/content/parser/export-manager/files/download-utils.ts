import { decodeContentDispositionFilenameValue } from './disposition-filename';
import { sanitizeFilename } from './naming';
import { stripAsciiControlCharacters } from '@sniptale/platform/security/sanitizers/text';

const URL_PARSE_BASE = 'https://sniptale.invalid';
const SAFE_CREDENTIALED_PROTOCOLS = new Set(['http:', 'https:']);
const PATH_SEGMENT_SEPARATOR_PATTERN = /[/\\]+/;

function resolveParsedUrl(url: string, baseUrl = URL_PARSE_BASE): URL | null {
  try {
    return new URL(url, baseUrl);
  } catch {
    try {
      return new URL(url, URL_PARSE_BASE);
    } catch {
      return null;
    }
  }
}

function decodeFilenamePathSeparators(filename: string): string {
  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
}

export function extractUuidFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url, URL_PARSE_BASE);
    const uuid = urlObj.searchParams.get('uuid');
    if (uuid) {
      return uuid.split('$').join('_');
    }
  } catch {
    // ignore malformed urls
  }
  return null;
}

export function getFileExtension(url: string): string | null {
  const match = url.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
  const extension = match?.[1];
  return extension ? extension.toLowerCase() : null;
}

export function extractFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }

  const encodedFilenameMatch = header.match(/filename\*\s*=\s*([^;]+)/i);
  if (encodedFilenameMatch?.[1]) {
    const decodedFilename = decodeContentDispositionFilenameValue(encodedFilenameMatch[1]);
    if (decodedFilename) {
      return sanitizeArchiveEntryFilename(decodedFilename);
    }
  }

  const quotedFilenameMatch = header.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedFilenameMatch?.[1]) {
    const decodedFilename = decodeContentDispositionFilenameValue(quotedFilenameMatch[1]);
    return decodedFilename ? sanitizeArchiveEntryFilename(decodedFilename) : null;
  }

  const plainFilenameMatch = header.match(/filename\s*=\s*([^;]+)/i);
  if (!plainFilenameMatch?.[1]) {
    return null;
  }

  const decodedFilename = decodeContentDispositionFilenameValue(plainFilenameMatch[1]);
  return decodedFilename ? sanitizeArchiveEntryFilename(decodedFilename) : null;
}

export function sanitizeArchiveEntryFilename(filename: string): string | null {
  const normalized = stripAsciiControlCharacters(
    decodeFilenamePathSeparators(filename),
    ' '
  ).trim();
  const leafName = normalized.split(PATH_SEGMENT_SEPARATOR_PATTERN).filter(Boolean).pop() ?? '';
  const sanitized = sanitizeFilename(leafName, 120);

  return sanitized.length > 0 && sanitized.replace(/\./g, '').length > 0 ? sanitized : null;
}

export function getExtensionFromMimeType(mimeType: string): string | null {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
    'text/html': 'html',
    'application/zip': 'zip',
    'application/x-rar-compressed': 'rar',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
  };

  return mimeToExt[mimeType] || null;
}

export function isValidDownloadUrl(href: string | null, baseUrl = URL_PARSE_BASE): boolean {
  return Boolean(resolveCredentialedDownloadUrl(href, baseUrl));
}

export function resolveCredentialedDownloadUrl(
  href: string | null,
  baseUrl = URL_PARSE_BASE
): string | null {
  if (!href || href === '#') {
    return null;
  }
  const normalizedHref = href.trim().toLowerCase();
  if (
    normalizedHref.startsWith('javascript:') ||
    normalizedHref.startsWith('vbscript:') ||
    normalizedHref.startsWith('data:')
  ) {
    return null;
  }

  const parsedUrl = resolveParsedUrl(href, baseUrl);
  if (!parsedUrl || !SAFE_CREDENTIALED_PROTOCOLS.has(parsedUrl.protocol)) {
    return null;
  }

  if (parsedUrl.username || parsedUrl.password) {
    return null;
  }

  const parsedBaseUrl = resolveParsedUrl(baseUrl, URL_PARSE_BASE);
  if (
    parsedBaseUrl &&
    SAFE_CREDENTIALED_PROTOCOLS.has(parsedBaseUrl.protocol) &&
    parsedUrl.origin !== parsedBaseUrl.origin
  ) {
    return null;
  }

  return parsedUrl.toString();
}

export function isIntermediateDownloadPageUrl(url: string): boolean {
  try {
    const parsed = new URL(url, URL_PARSE_BASE);

    if (parsed.searchParams.get('action') === 'show-download-screen') {
      return true;
    }

    if (parsed.searchParams.get('title') === 'Special:DownloadAsPdf') {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function shouldSkipHtmlDownloadResponse(params: {
  url: string;
  contentType: string | null;
  filename: string;
}): boolean {
  if (!params.contentType?.toLowerCase().startsWith('text/html')) {
    return false;
  }

  const explicitExtension = getFileExtension(params.filename) || getFileExtension(params.url);
  if (explicitExtension === 'html' || explicitExtension === 'htm') {
    return false;
  }

  try {
    const parsed = new URL(params.url, URL_PARSE_BASE);
    return (
      isIntermediateDownloadPageUrl(params.url) ||
      parsed.pathname.endsWith('.php') ||
      !explicitExtension
    );
  } catch {
    return isIntermediateDownloadPageUrl(params.url) || !explicitExtension;
  }
}

export function generateFilename(url: string, fallback: string, index: number): string {
  const uuid = extractUuidFromUrl(url);
  if (uuid) {
    const ext = getFileExtension(url);
    const filename = sanitizeArchiveEntryFilename(ext ? `${uuid}.${ext}` : uuid);
    if (filename) {
      return filename;
    }
  }

  try {
    const urlObj = new URL(url, URL_PARSE_BASE);
    const filename = urlObj.pathname.split('/').pop();
    if (filename && filename.length > 2 && !filename.includes('?') && filename !== 'download') {
      const sanitized = sanitizeArchiveEntryFilename(decodeURIComponent(filename));
      if (sanitized) {
        return sanitized;
      }
    }
  } catch {
    // ignore malformed urls
  }

  const sanitized = fallback
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 50);

  const ext = getFileExtension(url) || 'bin';
  return (
    sanitizeArchiveEntryFilename(`${sanitized || 'file'}_${index}.${ext}`) ?? `file_${index}.bin`
  );
}
