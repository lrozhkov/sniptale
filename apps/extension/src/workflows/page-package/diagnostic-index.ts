import {
  PAGE_PACKAGE_ARCHIVE_PATHS,
  type PagePackageDiagnosticsLevel,
  type PagePackageIntent,
  type PagePackageSource,
} from '@sniptale/runtime-contracts/page-package';
import { hashWebSnapshotAssetBlob } from '../../features/web-snapshot/asset-manifest';
import { sanitizeRawDiagnosticExportData } from '@sniptale/platform/observability/diagnostics/sanitizer';
import { createBlobContribution } from './contributions/blob';
import type { PagePackageContribution } from './paths';

type DiagnosticSectionId = 'designAndStyles' | 'exportLog' | 'extendedPageData';

const SECTION_DETAILS: Record<DiagnosticSectionId, { name: string; purpose: string }> = {
  exportLog: {
    name: 'Export log',
    purpose: 'Capture sequence, parser evidence, warnings, and consolidated issues.',
  },
  designAndStyles: {
    name: 'Design and styles',
    purpose: 'Stylesheets, targeted computed-style and pseudo-element probes, and fonts.',
  },
  extendedPageData: {
    name: 'Advanced page data',
    purpose: 'DOM states, resources, runtime page state, frames, Shadow DOM, and application map.',
  },
};

const SECTION_MATCHERS: Record<DiagnosticSectionId, readonly RegExp[]> = {
  exportLog: [
    /\/(?:errors\.log|capture-timeline\.json|issues\.json)$/u,
    /\/logs\/(?:meta|page-summary|parser-report|parser-tree|extraction-signals)\.json$/u,
    /\/logs\/(?:page-profile|detector-trace|root-selection|pipeline-trace|payload-trace)\.json$/u,
  ],
  designAndStyles: [/\/css\//u, /\/(?:fonts|stylesheets)\.json$/u],
  extendedPageData: [
    /\/(?:dom|virtual-dom)\.html\.txt$/u,
    /\/resource-timing\.json$/u,
    /^diagnostics\/runtime\//u,
    /^diagnostics\/extended\/(?:page\/|assets\.json$|document-metadata\.json$|scripts\.json$|frames\.json$|transformations\.json$|redactions\.json$)/u,
  ],
};

function matchesSection(path: string, section: DiagnosticSectionId): boolean {
  return SECTION_MATCHERS[section].some((matcher) => matcher.test(path));
}

function findFirstPath(paths: readonly string[], matchers: readonly RegExp[]): string | null {
  for (const matcher of matchers) {
    const path = paths.find((candidate) => matcher.test(candidate));
    if (path) return path;
  }
  return null;
}

function createDiagnosticIndex(args: {
  contributions: readonly PagePackageContribution<Blob>[];
  diagnosticsLevel: PagePackageDiagnosticsLevel;
  intent: PagePackageIntent;
  source: PagePackageSource;
}): string {
  const diagnosticPaths = args.contributions
    .filter((entry) => entry.component === 'diagnostics')
    .map((entry) => entry.path)
    .filter((path) => path !== PAGE_PACKAGE_ARCHIVE_PATHS.diagnosticsIndex)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const allPaths = args.contributions.map((entry) => entry.path);
  const livePath = findFirstPath(diagnosticPaths, [
    /^diagnostics\/extended\/page\/live-dom\.html\.txt$/u,
    /\/dom\.html\.txt$/u,
  ]);
  const preparedPath = findFirstPath(diagnosticPaths, [
    /^diagnostics\/extended\/page\/prepared-dom\.html\.txt$/u,
    /\/virtual-dom\.html\.txt$/u,
  ]);
  const hasPublishedWebCopy = allPaths.includes(PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml);
  const publishedPath = hasPublishedWebCopy
    ? (findFirstPath(diagnosticPaths, [
        /^diagnostics\/extended\/page\/published-dom\.html\.txt$/u,
      ]) ?? PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml)
    : null;
  const sections = (Object.keys(SECTION_MATCHERS) as DiagnosticSectionId[]).map((id) => ({
    id,
    ...SECTION_DETAILS[id],
    entries: diagnosticPaths.filter((path) => matchesSection(path, id)),
  }));

  return JSON.stringify(
    {
      schemaVersion: 1,
      purpose: 'Diagnostic snapshot of page state and the Sniptale capture process.',
      authority: {
        archiveInventory: PAGE_PACKAGE_ARCHIVE_PATHS.manifest,
        publishedRepresentation: publishedPath,
      },
      capture: {
        diagnosticsLevel: args.diagnosticsLevel,
        intent: args.intent,
        source: sanitizeRawDiagnosticExportData(args.source),
      },
      representations: [
        { stage: 'live', path: livePath, available: livePath !== null },
        { stage: 'prepared', path: preparedPath, available: preparedPath !== null },
        { stage: 'published', path: publishedPath, available: publishedPath !== null },
      ],
      sections,
      safety: {
        diagnosticsAreInert: true,
        htmlLikeDiagnosticsMustNotBeExecuted: true,
        publishedDocumentIsSanitized: publishedPath !== null,
        sensitiveValuesMayBeRedacted: true,
      },
      limitations: [
        'No response bodies or complete network transaction archive.',
        'No JavaScript heap, closures, framework runtime state, or event-listener inventory.',
        'No closed Shadow DOM or cross-origin iframe contents.',
        'No canvas, WebGL scene, cookies, browser storage, or Service Worker runtime state.',
        'The immutable package can describe capture and assembly, but not a later Library persistence result.',
      ],
    },
    null,
    2
  );
}

export async function addPagePackageDiagnosticIndex(args: {
  contributions: readonly PagePackageContribution<Blob>[];
  diagnosticsLevel: PagePackageDiagnosticsLevel;
  intent: PagePackageIntent;
  source: PagePackageSource;
}): Promise<PagePackageContribution<Blob>[]> {
  const contributions = args.contributions.filter(
    (entry) => entry.path !== PAGE_PACKAGE_ARCHIVE_PATHS.diagnosticsIndex
  );
  if (!contributions.some((entry) => entry.component === 'diagnostics')) {
    return [...contributions];
  }
  const content = createDiagnosticIndex({ ...args, contributions });
  const index = await createBlobContribution({
    blob: new Blob([content], { type: 'application/json' }),
    component: 'diagnostics',
    digest: hashWebSnapshotAssetBlob,
    mimeType: 'application/json',
    path: PAGE_PACKAGE_ARCHIVE_PATHS.diagnosticsIndex,
  });
  return [index, ...contributions];
}
