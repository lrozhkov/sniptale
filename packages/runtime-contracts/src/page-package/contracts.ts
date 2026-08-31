import type { ExportResourceLimits } from '../export/resource-limits';

export const PAGE_PACKAGE_SCHEMA_VERSION = 1 as const;
export const PAGE_PACKAGE_ARCHIVE_MIME_TYPE = 'application/x-sniptale-page-package+zip' as const;
export const PAGE_COLLECTION_ARCHIVE_MIME_TYPE =
  'application/x-sniptale-page-collection+zip' as const;
export const PAGE_PACKAGE_ARCHIVE_PATHS = {
  diagnosticsIndex: 'diagnostics/index.json',
  manifest: 'manifest.json',
  partialScreenshot: 'page-viewport-preview.png',
  readme: 'README.md',
  screenshot: 'page-screenshot.png',
  snapshotHtml: 'snapshot/index.html',
  thumbnail: 'thumbnail.webp',
} as const;

export type PagePackageScreenshotCoverage = 'full-page' | 'viewport';

export function resolvePagePackageScreenshotEntry(
  entries: readonly Pick<PagePackageEntry, 'path'>[]
): { coverage: PagePackageScreenshotCoverage; path: string } | null {
  const hasFullPage = entries.some((entry) => entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.screenshot);
  const hasViewport = entries.some(
    (entry) => entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.partialScreenshot
  );
  if (hasFullPage === hasViewport) return null;
  return hasFullPage
    ? { coverage: 'full-page', path: PAGE_PACKAGE_ARCHIVE_PATHS.screenshot }
    : { coverage: 'viewport', path: PAGE_PACKAGE_ARCHIVE_PATHS.partialScreenshot };
}
export const MAX_PAGE_PACKAGE_ENTRIES = 25_000;
export const MAX_PAGE_PACKAGE_ENTRY_BYTES = 16 * 1024 * 1024 * 1024;
export const MAX_PAGE_PACKAGE_TOTAL_BYTES = 64 * 1024 * 1024 * 1024;
export const MAX_PAGE_PACKAGE_WARNINGS = 500;
export const MAX_PAGE_PACKAGE_WARNINGS_BYTES = 512 * 1024;
export const MAX_PAGE_COLLECTION_PAGES = 999;
export const MAX_PAGE_PACKAGE_ID_BYTES = 128;
export const MAX_PAGE_PACKAGE_URL_BYTES = 16 * 1024;
export const MAX_PAGE_PACKAGE_TITLE_BYTES = 2 * 1024;
export const MAX_PAGE_PACKAGE_WARNING_BYTES = 4 * 1024;
export const MAX_PAGE_PACKAGE_PATH_LENGTH = 1024;
export const MAX_PAGE_PACKAGE_MIME_BYTES = 255;

export const PAGE_PACKAGE_COMPONENT_IDS = [
  'webCopy',
  'pageData',
  'images',
  'attachments',
  'diagnostics',
] as const;

export const PAGE_PACKAGE_WEB_COPY_ASSET_MIME_TYPES = [
  'font/woff',
  'font/woff2',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'text/css',
] as const;

export const PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE = [
  { path: 'diagnostics/extended/page/live-dom.html.txt', mimeType: 'text/plain' },
  { path: 'diagnostics/extended/page/prepared-dom.html.txt', mimeType: 'text/plain' },
  { path: 'diagnostics/extended/page/published-dom.html.txt', mimeType: 'text/plain' },
  { path: 'diagnostics/extended/assets.json', mimeType: 'application/json' },
  {
    path: 'diagnostics/extended/document-metadata.json',
    mimeType: 'application/json',
  },
  { path: 'diagnostics/extended/scripts.json', mimeType: 'application/json' },
  {
    path: 'diagnostics/extended/stylesheets.json',
    mimeType: 'application/json',
  },
  { path: 'diagnostics/extended/frames.json', mimeType: 'application/json' },
  {
    path: 'diagnostics/extended/transformations.json',
    mimeType: 'application/json',
  },
  {
    path: 'diagnostics/extended/redactions.json',
    mimeType: 'application/json',
  },
  {
    path: 'diagnostics/runtime/page-state.json',
    mimeType: 'application/json',
  },
  {
    path: 'diagnostics/runtime/resource-timing.json',
    mimeType: 'application/json',
  },
  {
    path: 'diagnostics/runtime/application-map.json',
    mimeType: 'application/json',
  },
] as const;

export type PagePackageExtendedDiagnosticPath =
  (typeof PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE)[number]['path'];

export function getPagePackageExtendedDiagnosticMimeType(
  path: string
): 'application/json' | 'text/plain' | null {
  return (
    PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE.find((entry) => entry.path === path)?.mimeType ??
    null
  );
}

export type PagePackageComponentId = (typeof PAGE_PACKAGE_COMPONENT_IDS)[number];
export type PagePackageWebCopyAssetMimeType =
  (typeof PAGE_PACKAGE_WEB_COPY_ASSET_MIME_TYPES)[number];
export type PagePackageIntent = 'save' | 'export';
export type PagePackageDiagnosticsLevel = 'none' | 'standard' | 'extended';
export type PagePackageComponentStatus = 'complete' | 'partial';

export type PagePackageJobIntent = 'export' | 'save';
export type PagePackageJobPhaseV1 =
  | 'running'
  | 'cancelling'
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'interrupted';
export type PagePackageProgressPhaseV1 =
  | 'idle'
  | 'scanning'
  | 'downloading'
  | 'zipping'
  | 'done'
  | 'cancelled'
  | 'error';
export type PagePackageProgressStepV1 =
  | 'annotations'
  | 'basicLogs'
  | 'cssDiagnostics'
  | 'files'
  | 'fullPageScreenshot'
  | 'viewportScreenshot'
  | 'images'
  | 'json'
  | 'markdown'
  | 'pageDiagnostics'
  | 'webSnapshotAssets'
  | 'webSnapshotDom'
  | 'webSnapshotPreview'
  | 'webSnapshotStyles'
  | 'webSnapshotWarnings';

export interface PagePackageExportOptionsV1 {
  includeAnnotations?: boolean;
  includeBasicLogs: boolean;
  includeCssDiagnostics: boolean;
  includeFiles: boolean;
  includeFullPageScreenshot: boolean;
  includeViewportScreenshot?: boolean;
  includeImages: boolean;
  includeJson: boolean;
  includeMarkdown: boolean;
  includePageDiagnostics: boolean;
  resourceLimits?: ExportResourceLimits;
}

export interface PagePackageProgressV1 {
  activeStepKey?: PagePackageProgressStepV1 | null;
  completedStepKeys?: PagePackageProgressStepV1[];
  current: number;
  errors: string[];
  failedStepKeys?: PagePackageProgressStepV1[];
  message: string;
  phase: PagePackageProgressPhaseV1;
  total: number;
}

export interface PagePackageTerminalResultV1 {
  errors: string[];
  filename?: string;
  kind?: 'archive' | 'webSnapshot';
  snapshotBatchSize?: number;
  snapshotIds?: string[];
  stats: { filesCount: number; filesFailed: number; rowsCount: number; sectionsCount: number };
  success: boolean;
  warnings?: string[];
}

export interface PagePackageEffectiveComponentPlanV1 {
  components: Record<PagePackageComponentId, boolean>;
  diagnosticsLevel: PagePackageDiagnosticsLevel;
  includeScreenshot: boolean;
}

export interface PagePackageJobPageOutcomeV1 {
  error?: string;
  ordinal: number;
  status: 'failed' | 'pending' | 'succeeded';
  tabId: number;
}

export interface PagePackageJobTab {
  tabId: number;
  title: string;
}

export interface PagePackageJobStatusV1 {
  activatedTabIds: number[];
  effectiveComponentPlan: PagePackageEffectiveComponentPlanV1;
  effectiveOptions: PagePackageExportOptionsV1;
  intent: PagePackageJobIntent;
  jobId: string;
  orderedTabs: PagePackageJobTab[];
  originalActiveTabs: Array<{ tabId: number; windowId: number }>;
  pageOutcomes: PagePackageJobPageOutcomeV1[];
  phase: PagePackageJobPhaseV1;
  progress: PagePackageProgressV1;
  result?: PagePackageTerminalResultV1;
  revision: number;
  warnings: string[];
}

export interface PagePackageSource {
  url: string | null;
  title: string | null;
  faviconUrl: string | null;
}

function truncatePagePackageUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = '';
  for (const character of value) {
    const characterBytes = estimateUtf8Bytes(character, maxBytes);
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

export function normalizePagePackageOptionalUrl(value: string | null | undefined): string | null {
  return typeof value === 'string' &&
    estimateUtf8Bytes(value, MAX_PAGE_PACKAGE_URL_BYTES) <= MAX_PAGE_PACKAGE_URL_BYTES
    ? value
    : null;
}

export function normalizePagePackageWarnings(values: readonly string[]): string[] {
  const warnings: string[] = [];
  const retained = new Set<string>();
  let totalBytes = 0;
  for (const value of values) {
    if (warnings.length >= MAX_PAGE_PACKAGE_WARNINGS) break;
    const remaining = MAX_PAGE_PACKAGE_WARNINGS_BYTES - totalBytes;
    if (remaining <= 0) break;
    const warning = truncatePagePackageUtf8(
      value,
      Math.min(MAX_PAGE_PACKAGE_WARNING_BYTES, remaining)
    );
    if (retained.has(warning)) continue;
    retained.add(warning);
    warnings.push(warning);
    totalBytes += estimateUtf8Bytes(warning, MAX_PAGE_PACKAGE_WARNING_BYTES);
  }
  return warnings;
}

export interface PagePackageViewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export interface PagePackageComponent {
  id: PagePackageComponentId;
  status: PagePackageComponentStatus;
  entryCount: number;
  totalBytes: number;
}

export interface PagePackageEntry {
  path: string;
  mimeType: string;
  size: number;
  sha256: string;
  component: PagePackageComponentId;
}

export interface PagePackageStats {
  entryCount: number;
  totalBytes: number;
  failedResourceCount: number;
  warningCount: number;
}

export interface PagePackageManifest {
  schemaVersion: typeof PAGE_PACKAGE_SCHEMA_VERSION;
  kind: 'page-package';
  id: string;
  capturedAt: string;
  intent: PagePackageIntent;
  source: PagePackageSource;
  viewport: PagePackageViewport | null;
  diagnosticsLevel: PagePackageDiagnosticsLevel;
  components: PagePackageComponent[];
  entries: PagePackageEntry[];
  warnings: string[];
  stats: PagePackageStats;
}

export interface PageCollectionManifestPage {
  ordinal: number;
  rootPath: string;
  manifestPath: string;
  pageId: string;
  title: string | null;
  manifestSha256: string;
  manifestSize: number;
  totalBytes: number;
}

export interface PageCollectionStats {
  requestedPageCount: number;
  pageCount: number;
  totalPageBytes: number;
  failedPageCount: number;
  warningCount: number;
}

export interface PageCollectionManifest {
  schemaVersion: typeof PAGE_PACKAGE_SCHEMA_VERSION;
  kind: 'page-collection';
  id: string;
  createdAt: string;
  pages: PageCollectionManifestPage[];
  warnings: string[];
  stats: PageCollectionStats;
}
import { estimateUtf8Bytes } from '../validation/base64';
