import {
  MAX_PAGE_COLLECTION_PAGES,
  MAX_PAGE_PACKAGE_TITLE_BYTES,
  MAX_PAGE_PACKAGE_URL_BYTES,
  PAGE_PACKAGE_SCHEMA_VERSION,
  parsePageCollectionManifest,
  type PagePackageEntry,
  type PageCollectionManifest,
} from '@sniptale/runtime-contracts/page-package';
import {
  assertSafeArchivePath,
  createArchivePathAllocator,
  sanitizeArchivePathSegment,
} from '../../../composition/archive-transfer/path';

const MAX_FAILURE_MESSAGE_BYTES = 4 * 1024;
const MAX_ERRORS_REPORT_BYTES = 8 * 1024 * 1024;
const UTF8_ENCODER = new TextEncoder();

export const PAGE_COLLECTION_README =
  '# Sniptale Page Collection\n\n' +
  'This archive contains safe page copies, exported page data, and capture reports. ' +
  'Open collection-manifest.json to inspect its contents.\n';

type PageCollectionFailureCode = 'page-capture-failed' | 'page-package-rejected';

interface PageCollectionFailedPage {
  code: PageCollectionFailureCode;
  message: string;
  ordinal: number;
  title: string | null;
  url: string | null;
}

export interface PageCollectionPagePackagePlan {
  entries: readonly PagePackageEntry[];
  manifestSha256: string;
  manifestSize: number;
  pageId: string;
  title: string | null;
  totalBytes: number;
}

interface PageCollectionSuccessfulPage {
  ordinal: number;
  pagePackage: PageCollectionPagePackagePlan;
  title: string | null;
}

interface PlanPageCollectionInput {
  createdAt: string;
  failedPages: readonly PageCollectionFailedPage[];
  id: string;
  successfulPages: readonly PageCollectionSuccessfulPage[];
  warnings: readonly string[];
}

interface PlannedCollectionPage {
  manifestPath: string;
  ordinal: number;
  pagePackage: PageCollectionPagePackagePlan;
  rootPath: string;
}

export interface PlannedPageCollection {
  archiveOrder: readonly string[];
  errorsBytes: Uint8Array;
  errorsText: string;
  manifest: PageCollectionManifest;
  manifestBytes: Uint8Array;
  manifestText: string;
  pages: readonly PlannedCollectionPage[];
  readmeBytes: Uint8Array;
  summaryBytes: Uint8Array;
  summaryText: string;
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertBoundedText(value: string, maxBytes: number, label: string): void {
  if (UTF8_ENCODER.encode(value).byteLength > maxBytes) {
    throw new Error(`${label} exceeds its byte limit.`);
  }
}

function assertOrdinal(ordinal: number): void {
  if (!Number.isSafeInteger(ordinal) || ordinal <= 0 || ordinal > MAX_PAGE_COLLECTION_PAGES) {
    throw new Error('Page Collection ordinal is outside the supported range.');
  }
}

function assertFailure(failure: PageCollectionFailedPage): void {
  assertOrdinal(failure.ordinal);
  if (
    (failure.code !== 'page-capture-failed' && failure.code !== 'page-package-rejected') ||
    (failure.title !== null &&
      (failure.title.normalize('NFC') !== failure.title ||
        UTF8_ENCODER.encode(failure.title).byteLength > MAX_PAGE_PACKAGE_TITLE_BYTES)) ||
    (failure.url !== null &&
      UTF8_ENCODER.encode(failure.url).byteLength > MAX_PAGE_PACKAGE_URL_BYTES)
  ) {
    throw new Error(`Invalid failed Page Collection row at ordinal ${failure.ordinal}.`);
  }
  assertBoundedText(failure.message, MAX_FAILURE_MESSAGE_BYTES, 'Page Collection failure message');
}

function assertCompleteOrdinals(ordinals: readonly number[]): void {
  if (ordinals.length === 0 || ordinals.length > MAX_PAGE_COLLECTION_PAGES) {
    throw new Error('Page Collection requires between 1 and 999 requested pages.');
  }
  const ordered = [...ordinals].sort((left, right) => left - right);
  if (ordered.some((ordinal, index) => ordinal !== index + 1)) {
    throw new Error('Page Collection ordinals must form one complete ordered sequence.');
  }
}

function serializePageCollectionManifest(manifest: PageCollectionManifest): string {
  return canonicalJson(manifest);
}

export function planPageCollection(input: PlanPageCollectionInput): PlannedPageCollection {
  input.failedPages.forEach(assertFailure);
  input.successfulPages.forEach((page) => assertOrdinal(page.ordinal));
  assertCompleteOrdinals([
    ...input.successfulPages.map((page) => page.ordinal),
    ...input.failedPages.map((page) => page.ordinal),
  ]);

  const allocator = createArchivePathAllocator();
  const collectionManifestPath = allocator.reserve(['collection-manifest.json']);
  const readmePath = allocator.reserve(['README.md']);
  const summaryPath = allocator.reserve(['reports', 'summary.json']);
  const errorsPath = allocator.reserve(['reports', 'errors.json']);
  if (
    collectionManifestPath !== 'collection-manifest.json' ||
    readmePath !== 'README.md' ||
    summaryPath !== 'reports/summary.json' ||
    errorsPath !== 'reports/errors.json'
  ) {
    throw new Error('Page Collection generated root paths collided.');
  }

  const orderedSuccessfulPages = [...input.successfulPages].sort(
    (left, right) => left.ordinal - right.ordinal
  );
  const plannedPages = orderedSuccessfulPages.map((page) => {
    const normalizedTitle = sanitizeArchivePathSegment(page.title ?? '', 'page');
    const requestedRoot = `${String(page.ordinal).padStart(3, '0')}-${normalizedTitle}`;
    const expectedRoot = `pages/${sanitizeArchivePathSegment(requestedRoot)}`;
    const manifestPath = allocator.reserve(['pages', requestedRoot, 'manifest.json']);
    const rootPath = manifestPath.slice(0, -'/manifest.json'.length);
    if (rootPath !== expectedRoot) {
      throw new Error(`Unexpected Page Collection root collision: ${rootPath}.`);
    }
    for (const entry of page.pagePackage.entries) {
      assertSafeArchivePath(`${rootPath}/${entry.path}`);
    }
    return { manifestPath, ordinal: page.ordinal, pagePackage: page.pagePackage, rootPath };
  });

  const pages = plannedPages.map(({ manifestPath, pagePackage, rootPath }, index) => ({
    ordinal: orderedSuccessfulPages[index]!.ordinal,
    rootPath,
    manifestPath,
    pageId: pagePackage.pageId,
    title: pagePackage.title,
    manifestSha256: pagePackage.manifestSha256,
    manifestSize: pagePackage.manifestSize,
    totalBytes: pagePackage.totalBytes,
  }));
  const totalPageBytes = pages.reduce((total, page) => total + page.totalBytes, 0);
  if (!Number.isSafeInteger(totalPageBytes)) {
    throw new Error('Page Collection total bytes exceed the safe integer range.');
  }
  const manifestCandidate: PageCollectionManifest = {
    schemaVersion: PAGE_PACKAGE_SCHEMA_VERSION,
    kind: 'page-collection',
    id: input.id,
    createdAt: input.createdAt,
    pages,
    warnings: [...input.warnings],
    stats: {
      requestedPageCount: input.successfulPages.length + input.failedPages.length,
      pageCount: input.successfulPages.length,
      totalPageBytes,
      failedPageCount: input.failedPages.length,
      warningCount: input.warnings.length,
    },
  };
  const manifest = parsePageCollectionManifest(manifestCandidate);
  if (!manifest) throw new Error('Page Collection manifest violates the version 1 contract.');

  const orderedFailures = [...input.failedPages]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map(({ ordinal, title, url, code, message }) => ({
      ordinal,
      title,
      url,
      code,
      message,
    }));
  const summaryText = canonicalJson({
    schemaVersion: PAGE_PACKAGE_SCHEMA_VERSION,
    kind: 'page-collection-summary',
    requestedPageCount: manifest.stats.requestedPageCount,
    successfulPageCount: manifest.stats.pageCount,
    failedPageCount: manifest.stats.failedPageCount,
  });
  const errorsText = canonicalJson({
    schemaVersion: PAGE_PACKAGE_SCHEMA_VERSION,
    kind: 'page-collection-errors',
    failures: orderedFailures,
  });
  const errorsBytes = UTF8_ENCODER.encode(errorsText);
  if (errorsBytes.byteLength > MAX_ERRORS_REPORT_BYTES) {
    throw new Error('Page Collection errors report exceeds its byte limit.');
  }
  const manifestText = serializePageCollectionManifest(manifest);
  const archiveOrder = [collectionManifestPath, readmePath];
  for (const page of plannedPages) {
    archiveOrder.push(
      page.manifestPath,
      ...page.pagePackage.entries.map((entry) => `${page.rootPath}/${entry.path}`)
    );
  }
  archiveOrder.push(summaryPath, errorsPath);
  return {
    archiveOrder,
    errorsBytes,
    errorsText,
    manifest,
    manifestBytes: UTF8_ENCODER.encode(manifestText),
    manifestText,
    pages: plannedPages,
    readmeBytes: UTF8_ENCODER.encode(PAGE_COLLECTION_README),
    summaryBytes: UTF8_ENCODER.encode(summaryText),
    summaryText,
  };
}
