import {
  MAX_PAGE_COLLECTION_PAGES,
  MAX_PAGE_PACKAGE_ID_BYTES,
  MAX_PAGE_PACKAGE_PATH_LENGTH,
  MAX_PAGE_PACKAGE_TITLE_BYTES,
  PAGE_PACKAGE_SCHEMA_VERSION,
  type PageCollectionManifest,
  type PageCollectionManifestPage,
  type PageCollectionStats,
} from './contracts';
import {
  addWithinSafeInteger,
  hasExactKeys,
  hasUnsafePathSegment,
  isBoundedString,
  isCanonicalIsoInstant,
  isNfcBoundedString,
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
  isRecord,
  isSha256,
  parseWarnings,
} from './parser-primitives';

function parseCollectionPage(value: unknown): PageCollectionManifestPage | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'ordinal',
      'rootPath',
      'manifestPath',
      'pageId',
      'title',
      'manifestSha256',
      'manifestSize',
      'totalBytes',
    ]) ||
    !isPositiveSafeInteger(value.ordinal) ||
    value.ordinal > MAX_PAGE_COLLECTION_PAGES ||
    !isNfcBoundedString(value.rootPath, MAX_PAGE_PACKAGE_PATH_LENGTH) ||
    !isNfcBoundedString(value.manifestPath, MAX_PAGE_PACKAGE_PATH_LENGTH) ||
    value.manifestPath !== `${value.rootPath}/manifest.json` ||
    !value.rootPath.startsWith('pages/') ||
    hasUnsafePathSegment(value.manifestPath) ||
    !isBoundedString(value.pageId, MAX_PAGE_PACKAGE_ID_BYTES) ||
    !(
      value.title === null || isNfcBoundedString(value.title, MAX_PAGE_PACKAGE_TITLE_BYTES, true)
    ) ||
    !isSha256(value.manifestSha256) ||
    !isPositiveSafeInteger(value.manifestSize) ||
    !isNonNegativeSafeInteger(value.totalBytes) ||
    value.totalBytes < value.manifestSize
  ) {
    return null;
  }
  return value as unknown as PageCollectionManifestPage;
}

interface CollectionManifestRoot {
  createdAt: string;
  id: string;
  pages: unknown[];
  stats: unknown;
  warnings: unknown;
}

function parseCollectionManifestRoot(value: unknown): CollectionManifestRoot | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'kind',
      'id',
      'createdAt',
      'pages',
      'warnings',
      'stats',
    ]) ||
    value.schemaVersion !== PAGE_PACKAGE_SCHEMA_VERSION ||
    value.kind !== 'page-collection' ||
    !isBoundedString(value.id, MAX_PAGE_PACKAGE_ID_BYTES) ||
    !isCanonicalIsoInstant(value.createdAt) ||
    !Array.isArray(value.pages) ||
    value.pages.length > MAX_PAGE_COLLECTION_PAGES
  ) {
    return null;
  }
  return value as unknown as CollectionManifestRoot;
}

interface ParsedCollectionPages {
  pages: PageCollectionManifestPage[];
  totalPageBytes: number;
}

function parseCollectionPages(value: unknown[]): ParsedCollectionPages | null {
  const pages: PageCollectionManifestPage[] = [];
  const ordinals = new Set<number>();
  const roots = new Set<string>();
  let previousOrdinal = 0;
  let totalPageBytes = 0;
  for (const item of value) {
    const page = parseCollectionPage(item);
    if (!page || page.ordinal <= previousOrdinal || ordinals.has(page.ordinal)) return null;
    const rootKey = page.rootPath.toLocaleLowerCase('en-US');
    if (roots.has(rootKey)) return null;
    const nextTotal = addWithinSafeInteger(totalPageBytes, page.totalBytes);
    if (nextTotal === null) return null;
    ordinals.add(page.ordinal);
    roots.add(rootKey);
    pages.push(page);
    previousOrdinal = page.ordinal;
    totalPageBytes = nextTotal;
  }
  return { pages, totalPageBytes };
}

function parseCollectionStats(
  value: unknown,
  parsedPages: ParsedCollectionPages,
  warningCount: number
): PageCollectionStats | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'requestedPageCount',
      'pageCount',
      'totalPageBytes',
      'failedPageCount',
      'warningCount',
    ])
  )
    return null;
  if (
    !isPositiveSafeInteger(value.requestedPageCount) ||
    value.requestedPageCount > MAX_PAGE_COLLECTION_PAGES ||
    !isNonNegativeSafeInteger(value.pageCount) ||
    !isNonNegativeSafeInteger(value.totalPageBytes) ||
    !isNonNegativeSafeInteger(value.failedPageCount) ||
    !isNonNegativeSafeInteger(value.warningCount)
  ) {
    return null;
  }
  const requestedPageCount = value.requestedPageCount;
  if (
    value.pageCount !== parsedPages.pages.length ||
    requestedPageCount !== value.pageCount + value.failedPageCount ||
    value.totalPageBytes !== parsedPages.totalPageBytes ||
    value.warningCount !== warningCount ||
    parsedPages.pages.some((page) => page.ordinal > requestedPageCount)
  ) {
    return null;
  }
  return {
    requestedPageCount,
    pageCount: value.pageCount,
    totalPageBytes: value.totalPageBytes,
    failedPageCount: value.failedPageCount,
    warningCount: value.warningCount,
  };
}

export function parsePageCollectionManifest(value: unknown): PageCollectionManifest | null {
  const root = parseCollectionManifestRoot(value);
  if (!root) return null;
  const parsedPages = parseCollectionPages(root.pages);
  const warnings = parseWarnings(root.warnings);
  if (!parsedPages || !warnings) return null;
  const stats = parseCollectionStats(root.stats, parsedPages, warnings.length);
  if (!stats) return null;
  return {
    schemaVersion: PAGE_PACKAGE_SCHEMA_VERSION,
    kind: 'page-collection',
    id: root.id,
    createdAt: root.createdAt,
    pages: parsedPages.pages,
    warnings,
    stats,
  };
}
