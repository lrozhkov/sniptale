import {
  getPagePackageExtendedDiagnosticMimeType,
  MAX_PAGE_PACKAGE_MIME_BYTES,
  PAGE_PACKAGE_ARCHIVE_PATHS,
  PAGE_PACKAGE_WEB_COPY_ASSET_MIME_TYPES,
  type PagePackageComponentId,
  type PagePackageWebCopyAssetMimeType,
} from './contracts';
import { hasUnsafePathSegment, utf8Size } from './parser-primitives';

const MIME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const REQUIRED_WEB_COPY_MIME: Readonly<Record<string, string>> = {
  [PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml]: 'text/html',
  [PAGE_PACKAGE_ARCHIVE_PATHS.screenshot]: 'image/png',
  [PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail]: 'image/webp',
};
const INERT_DIAGNOSTIC_MIME_TYPES = ['application/json', 'text/plain'] as const;
const ACTIVE_DIAGNOSTIC_PATH_SUFFIXES = [
  '.css',
  '.htm',
  '.html',
  '.js',
  '.mjs',
  '.cjs',
  '.svg',
  '.xhtml',
  '.xml',
] as const;

function hasRecursiveLeaf(path: string, prefix: string): boolean {
  return path.startsWith(prefix) && path.length > prefix.length && !hasUnsafePathSegment(path);
}

export function isExtendedDiagnosticPath(path: string): boolean {
  return path.startsWith('diagnostics/extended/');
}

function isActiveDiagnosticPath(path: string): boolean {
  const normalized = path.toLocaleLowerCase('en-US');
  return ACTIVE_DIAGNOSTIC_PATH_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function isDiagnosticEntryPath(path: string, mimeType: string): boolean {
  if (
    !INERT_DIAGNOSTIC_MIME_TYPES.includes(
      mimeType as (typeof INERT_DIAGNOSTIC_MIME_TYPES)[number]
    ) ||
    isActiveDiagnosticPath(path)
  ) {
    return false;
  }
  if (isExtendedDiagnosticPath(path)) {
    return getPagePackageExtendedDiagnosticMimeType(path) === mimeType;
  }
  return (
    hasRecursiveLeaf(path, 'diagnostics/standard/') || hasRecursiveLeaf(path, 'diagnostics/export/')
  );
}

export function isPagePackageMimeType(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    utf8Size(value) <= MAX_PAGE_PACKAGE_MIME_BYTES &&
    MIME_PATTERN.test(value)
  );
}

export function isPagePackageWebCopyAssetMimeType(
  value: unknown
): value is PagePackageWebCopyAssetMimeType {
  return (
    typeof value === 'string' &&
    PAGE_PACKAGE_WEB_COPY_ASSET_MIME_TYPES.includes(value as PagePackageWebCopyAssetMimeType)
  );
}

export function isPagePackageEntryPath(
  component: PagePackageComponentId,
  path: string,
  mimeType: string
): boolean {
  if (hasUnsafePathSegment(path) || path.toLocaleLowerCase('en-US').endsWith('.zip')) return false;
  const requiredMime = REQUIRED_WEB_COPY_MIME[path];
  if (requiredMime !== undefined) {
    return (
      mimeType === requiredMime &&
      (component === 'webCopy' ||
        (path === PAGE_PACKAGE_ARCHIVE_PATHS.screenshot && component === 'images'))
    );
  }
  switch (component) {
    case 'webCopy':
      return hasRecursiveLeaf(path, 'assets/') && isPagePackageWebCopyAssetMimeType(mimeType);
    case 'pageData':
      return hasRecursiveLeaf(path, 'exports/data/');
    case 'images':
      return hasRecursiveLeaf(path, 'exports/images/');
    case 'attachments':
      return hasRecursiveLeaf(path, 'attachments/');
    case 'diagnostics':
      return isDiagnosticEntryPath(path, mimeType);
  }
}
